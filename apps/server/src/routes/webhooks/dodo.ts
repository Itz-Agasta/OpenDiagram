/**
 * Inbound Dodo Payments webhooks. This is the only writer of the `subscription`
 * table -- entitlement follows what Dodo says happened, never what a client
 * claims.
 *
 * Three properties this handler has to hold, in order of how badly they bite:
 *
 * 1. **Verify before trusting.** The body is read as raw text and handed to
 *    `webhooks.unwrap`, which checks the Standard Webhooks signature over the
 *    exact bytes. Parsing first and re-serializing changes those bytes and the
 *    signature stops matching.
 * 2. **Idempotent.** Dodo retries any non-2xx, so the same `webhook-id` arrives
 *    more than once. The event row is inserted first and a conflict short-circuits.
 * 3. **Ordered.** Retries can also arrive out of order, so a `subscription.active`
 *    replay must not overwrite a later `cancelled`. Every write is guarded on
 *    `lastEventAt`.
 *
 * And one deployment constraint: Cloud Run throttles CPU the instant the response
 * completes, so every DB write happens before the 200. Nothing is deferred.
 */
import { db, eq } from "@OpenDiagram/db";
import { webhookEvent } from "@OpenDiagram/db/schema/billing";
import type { UnwrapWebhookEvent } from "dodopayments/resources/webhooks/webhooks";
import type { AuditableLogger } from "evlog";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { dodoClient } from "../../lib/dodo";
import { clawback, clawbackForDispute, upsertSubscription } from "../../lib/dodo/subscription-sync";

export const dodoWebhookRoute = new Hono<EvlogVariables>();

dodoWebhookRoute.post("/", async (c) => {
  // The request logger, not a module-level `createLogger()`. That returns a
  // unit-of-work accumulator that only writes on `.emit()`, so a module-scoped
  // one never emits: every line below would go nowhere, including the signature
  // failure that is the sole signal a paying user was silently not upgraded.
  const log = c.get("log");
  const client = dodoClient();
  // Billing unconfigured is the self-host default, and a 404 says so honestly
  // rather than pretending to accept events we can't verify.
  if (!client) return c.json({ error: "Billing is not configured." }, 404);

  const raw = await c.req.text();
  const headers = Object.fromEntries(c.req.raw.headers.entries());

  let event: UnwrapWebhookEvent;
  try {
    event = client.webhooks.unwrap(raw, { headers });
  } catch (error) {
    // Alert on this. A 401 here means paid users silently never get upgraded:
    // the most likely cause is a test-mode secret left in place after the switch
    // to live, and nothing else in the system would surface it.
    //
    // The Error goes in as the FIRST argument, which is evlog's documented shape
    // (`log.error(err, { context })`) and the only one that keeps the reason:
    // it lands as `error.message` with the context merged alongside. Passing a
    // string first and `{ error }` as context -- which reads more naturally and is
    // what this used to do -- overwrites the error context with a raw Error, and
    // an Error JSON-serialises to `{}`. Measured on this exact endpoint: that
    // shape emitted `"error":{}` with no message at all, so the Sentry alert this
    // line exists to feed would have said only "401 on /api/webhooks/dodo".
    // Telling "wrong secret" from "timestamp outside tolerance" is the entire
    // value of that alert, especially in the hours after the live-mode switch.
    log.error(error instanceof Error ? error : String(error), {
      dodo: { webhookId: headers["webhook-id"] },
    });
    return c.json({ error: "Invalid signature" }, 401);
  }

  const webhookId = headers["webhook-id"];
  if (!webhookId) return c.json({ error: "Missing webhook-id" }, 400);

  log.set({ dodo: { webhookId, type: event.type } });

  // Record the event, then decide from `processedAt` -- not from row existence --
  // whether it still needs handling. Keying only on "row exists" would strand any
  // event whose first attempt failed: the audit row would make every retry look
  // like a duplicate and the subscription would never sync.
  const [inserted] = await db
    .insert(webhookEvent)
    .values({ id: webhookId, eventType: event.type, payload: event })
    .onConflictDoNothing({ target: webhookEvent.id })
    .returning({ id: webhookEvent.id });

  if (!inserted) {
    const [existing] = await db
      .select({ processedAt: webhookEvent.processedAt })
      .from(webhookEvent)
      .where(eq(webhookEvent.id, webhookId))
      .limit(1);

    if (existing?.processedAt) {
      log.info("Dodo webhook already processed");
      return c.json({ received: true, duplicate: true });
    }
    log.warn("Retrying a Dodo webhook whose earlier attempt failed");
  }

  let skipped: string | null;
  try {
    // Concurrent deliveries of the same event can both reach this. That's safe:
    // the subscription upsert is idempotent and guarded on `lastEventAt`.
    skipped = await handleEvent(event, log);
  } catch (error) {
    // Read the cause out BEFORE logging. evlog rewrites the message of the Error
    // it captures, so reading it afterwards stores the log's own wording and
    // loses the one detail this column exists to keep.
    const reason = error instanceof Error ? error.message : String(error);
    log.error(error instanceof Error ? error : String(error), { dodo: { stage: "handler" } });
    // Kept, with the reason, so a stuck event is greppable. `processedAt` stays
    // null, so Dodo's retry will run the handler again rather than short-circuit.
    await db.update(webhookEvent).set({ error: reason }).where(eq(webhookEvent.id, webhookId));
    return c.json({ error: "Webhook processing failed" }, 500);
  }

  // `processedAt` is set either way, so a permanently unapplicable event isn't
  // redelivered forever -- but a skip reason is recorded rather than being
  // indistinguishable from a real sync. `processed_at IS NOT NULL AND error IS
  // NOT NULL` is exactly "accepted, deliberately not applied"; the failure path
  // above is the opposite pair and still invites a retry.
  if (skipped) log.warn("Dodo webhook accepted but not applied", { dodo: { skipped } });

  await db
    .update(webhookEvent)
    .set({ processedAt: new Date(), error: skipped })
    .where(eq(webhookEvent.id, webhookId));

  return c.json({ received: true });
});

/** Returns null when the event was applied, or the reason it deliberately wasn't. */
async function handleEvent(
  event: UnwrapWebhookEvent,
  log: AuditableLogger,
): Promise<string | null> {
  const eventAt = new Date(event.timestamp);

  switch (event.type) {
    // Every one of these carries the full Subscription object, so they all
    // reduce to the same upsert -- the row mirrors Dodo's state and the plan is
    // derived from status plus period end, not from which event arrived.
    case "subscription.active":
    case "subscription.renewed":
    case "subscription.plan_changed":
    case "subscription.updated":
    case "subscription.on_hold":
    case "subscription.failed":
    case "subscription.cancelled":
    case "subscription.expired":
    // Carries a full Subscription like the rest, so it costs nothing to keep the
    // row in sync rather than discarding the payload.
    case "subscription.update_payment_method":
      return await upsertSubscription(event.data, eventAt, log);

    // Log-only, for reconciling our ledger against Dodo payouts. Entitlement
    // never moves on a payment event: `subscription.*` is the authority, and
    // acting on both would double-apply.
    case "payment.succeeded":
    case "payment.failed":
      log.info("Dodo payment event", {
        dodo: { paymentId: event.data.payment_id, amount: event.data.total_amount },
      });
      return null;

    // Money went back, so access and credits go with it, immediately -- not at
    // period end the way a cancellation does.
    case "refund.succeeded":
      return await clawback(event.data, eventAt, log);

    // A chargeback is a refund we did not choose, and **no `refund.*` event fires
    // for one** -- so without these two the clawback above never runs and someone
    // who disputed the charge keeps Pro until the period ends. `dispute.lost` is
    // the network deciding for the cardholder; `dispute.accepted` is us not
    // contesting. Dodo's docs are explicit that both mean the funds are gone and
    // access should stay revoked, and RDR auto-resolutions arrive as `dispute.lost`.
    //
    // Deliberately NOT acting on `dispute.opened`: the money is only held at that
    // point, and a dispute we go on to win would have to be un-revoked, which is a
    // restore path with no natural trigger. Waiting for the terminal event keeps
    // this one-directional.
    case "dispute.lost":
    case "dispute.accepted":
      return await clawbackForDispute(event.data, eventAt, log);

    default:
      log.info("Unhandled Dodo webhook event");
      return null;
  }
}
