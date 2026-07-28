/**
 * Applies Dodo subscription state to our `subscription` table.
 *
 * Split from the webhook route on purpose: that file owns *transport* concerns
 * (signature verification, idempotency, replay ordering) and this one owns what
 * an event *means* for entitlement. They change for unrelated reasons -- a Dodo
 * API shape change touches this file, a Standard Webhooks change touches that one.
 *
 * Two callers only: the webhook handler, and `POST /api/billing/reconcile` (the
 * post-checkout confirmation, which verifies ownership against Dodo's copy before
 * calling in). Entitlement follows what Dodo says happened, never what a client
 * claims -- which is why neither caller passes anything a browser supplied.
 */
import { and, db, eq, sql } from "@OpenDiagram/db";
import { user } from "@OpenDiagram/db/schema/auth";
import {
  subscription,
  subscriptionStatuses,
  type SubscriptionStatus,
} from "@OpenDiagram/db/schema/subscription";
import type { Dispute } from "dodopayments/resources/disputes";
import type { Refund } from "dodopayments/resources/refunds";
import type { Subscription } from "dodopayments/resources/subscriptions";
import type { AuditableLogger } from "evlog";
import { exhaustCreationQuota, getUserActor } from "../quota";
import { dodoClient, planIdForProduct } from "./client";

/**
 * Resolves the Dodo customer back to our user.
 *
 * `metadata.userId` is set on every checkout we create, so it is the reliable
 * path; the email lookup only covers a subscription started outside our flow
 * (a manual one from the Dodo dashboard, say).
 */
async function resolveUserId(data: Subscription): Promise<string | null> {
  // Dodo types metadata values as string | number | boolean, so narrow rather
  // than trusting the shape we wrote at checkout.
  const fromMetadata = data.metadata?.userId;
  if (typeof fromMetadata === "string" && fromMetadata.length > 0) return fromMetadata;

  const email = data.customer.email;
  if (!email) return null;

  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  return row?.id ?? null;
}

/** Returns null once the row mirrors Dodo, or the reason it was left untouched. */
export async function upsertSubscription(
  data: Subscription,
  eventAt: Date,
  log: AuditableLogger,
  /**
   * `insertOnly` writes the row only when none exists, and touches nothing when
   * one does. It is for the post-checkout reconcile, which reads a snapshot with
   * no provider timestamp attached: any watermark it invents is either in our
   * clock domain (and can then out-rank a genuinely later webhook when our clock
   * runs ahead of Dodo's) or is `created_at` (and is then out-ranked by every
   * webhook the subscription will ever emit). Not competing at all is the way out
   * -- reconcile exists to grant the *initial* entitlement, and once a row exists
   * the webhook has already spoken.
   */
  options: { insertOnly?: boolean } = {},
): Promise<string | null> {
  const userId = await resolveUserId(data);
  if (!userId) {
    // Not an error we can retry out of, so don't 500 and invite Dodo to hammer
    // us: record it and move on. A subscription we can't attribute is a support
    // ticket, not a transient failure. The returned reason is what stops it
    // being filed as a successful sync.
    log.warn("Dodo subscription could not be matched to a user", {
      dodo: { subscriptionId: data.subscription_id, email: data.customer.email },
    });
    return "subscription could not be matched to a user";
  }

  const planId = planIdForProduct(data.product_id);
  if (!planId) {
    // Thrown, not returned as a skip. Unlike an unattributable user this is a
    // *configuration* fault -- the live-mode shape of it is a wrong
    // `DODO_PRO_PRODUCT_ID`, which hits every payer -- and it is fixable by
    // editing an env var. Marking it processed would strand every affected
    // subscription: the fix would land and the redelivery, including a manual
    // replay from the Dodo dashboard, would short-circuit as a duplicate.
    // Throwing keeps `processedAt` null, so a retry re-runs the handler.
    throw new Error(
      `Dodo subscription ${data.subscription_id} references unknown product ${data.product_id}`,
    );
  }

  // Validated, not cast. `text(..., { enum })` is a TypeScript-only constraint --
  // there is no CHECK on this column (confirmed against the live database) -- so a
  // status Dodo adds later would be written straight through, land outside
  // `ENTITLING_SUBSCRIPTION_STATUSES`, and silently de-entitle a paying customer.
  // Throwing instead takes the same path as an unknown product: `processedAt` stays
  // null, so the event is redelivered once the new status is understood.
  if (!(subscriptionStatuses as readonly string[]).includes(data.status)) {
    throw new Error(`Dodo subscription ${data.subscription_id} has unknown status ${data.status}`);
  }

  const row = {
    id: data.subscription_id,
    userId,
    dodoCustomerId: data.customer.customer_id,
    planId,
    status: data.status as SubscriptionStatus,
    // Dodo's billing anchor. `previous_billing_date` is the start of the period
    // currently being paid for, which is what quota windows roll on.
    currentPeriodStart: new Date(data.previous_billing_date),
    currentPeriodEnd: new Date(data.next_billing_date),
    cancelAtPeriodEnd: data.cancel_at_next_billing_date,
    lastEventAt: eventAt,
    recurringAmountCents: data.recurring_pre_tax_amount,
  };

  if (options.insertOnly) {
    await db.insert(subscription).values(row).onConflictDoNothing({ target: subscription.id });
    log.info("Dodo subscription seeded", {
      dodo: { subscriptionId: data.subscription_id, status: row.status, planId },
    });
    return null;
  }

  await db
    .insert(subscription)
    .values(row)
    .onConflictDoUpdate({
      target: subscription.id,
      set: {
        planId: row.planId,
        status: row.status,
        currentPeriodStart: row.currentPeriodStart,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        lastEventAt: row.lastEventAt,
        recurringAmountCents: row.recurringAmountCents,
        updatedAt: new Date(),
      },
      // The ordering guard: a redelivered older event is dropped rather than
      // rolling a cancellation back to active.
      //
      // `setWhere`, not `where`. Both currently emit the same
      // `DO UPDATE SET ... WHERE` clause -- verified by generating the SQL -- but
      // `where` is @deprecated in drizzle 0.45.2 in favour of an explicit
      // `targetWhere`/`setWhere` split. The two mean very different things: on the
      // conflict target this would be an index predicate, not a guard on the row
      // being overwritten. Naming it explicitly means a future drizzle release
      // cannot quietly reinterpret the clause that stops a replayed
      // `subscription.active` resurrecting a cancelled subscription.
      setWhere: sql`${subscription.lastEventAt} <= ${eventAt.toISOString()}`,
    });

  log.info("Dodo subscription synced", {
    dodo: { subscriptionId: data.subscription_id, status: row.status, planId },
  });
  return null;
}

/**
 * Ends access now and burns the remaining credits of the window they fall back to.
 *
 * Scoped to the one subscription the refunded payment belongs to, which the refund
 * payload does not carry -- it has only `payment_id` -- so the payment has to be
 * fetched. Matching on `customer_id` instead, as this used to, revokes *every*
 * subscription that customer holds: a refund for a cancelled period would take a
 * new, paid subscription down with it.
 *
 * A failed lookup throws, which the webhook route turns into a 500 so Dodo retries.
 * Guessing the subscription is worse than being redelivered.
 */
export async function clawback(
  refund: Refund,
  eventAt: Date,
  log: AuditableLogger,
): Promise<string | null> {
  const client = dodoClient();
  if (!client) return "billing is not configured";

  const payment = await client.payments.retrieve(refund.payment_id);

  // A partial refund is a goodwill gesture or a proration, not an unwind of the sale.
  // Ending the period and burning the fallback window over one would take the whole
  // month's access away for a few dollars back.
  //
  // Two signals, either of which means the sale is fully unwound, because neither
  // alone is sufficient. `refund.is_partial` is Dodo's classification of *this*
  // refund, so a payment refunded in two partial instalments is never `false` on
  // either one and would keep entitlement forever. `payment.refund_status` is the
  // running total on the payment and catches that, but it is optional in the SDK
  // (`'partial' | 'full' | undefined`), so it cannot be the only test either.
  const fullyRefunded = payment.refund_status === "full" || refund.is_partial === false;
  if (!fullyRefunded) {
    log.info("Dodo partial refund leaves entitlement in place", {
      dodo: {
        paymentId: refund.payment_id,
        refundId: refund.refund_id,
        refundStatus: payment.refund_status ?? null,
      },
    });
    // Intentional and correct, not a skip worth flagging.
    return null;
  }

  if (!payment.subscription_id) {
    // We only sell subscriptions, so a one-time payment refund has no entitlement
    // attached to reverse.
    log.info("Dodo refund was not for a subscription payment", {
      dodo: { paymentId: refund.payment_id },
    });
    return null;
  }
  return await revokeSubscription(payment.subscription_id, eventAt, log, {
    paymentId: refund.payment_id,
    cause: "refund",
  });
}

/**
 * A lost or accepted chargeback: the cardholder has their money back.
 *
 * Economically identical to a full refund, but it arrives as a `dispute.*` event
 * and **no `refund.*` event ever fires**, so without this the clawback above never
 * runs and the customer keeps Pro for free. Dodo's dispute docs are explicit that
 * `dispute.lost` means "funds returned to the cardholder -- reconcile and keep
 * access revoked", and disputes auto-resolved through Visa RDR also surface here.
 *
 * `Dispute` carries `payment_id` but no `subscription_id`, so it resolves the same
 * way the refund path does.
 */
export async function clawbackForDispute(
  dispute: Dispute,
  eventAt: Date,
  log: AuditableLogger,
): Promise<string | null> {
  const client = dodoClient();
  if (!client) return "billing is not configured";

  const payment = await client.payments.retrieve(dispute.payment_id);
  if (!payment.subscription_id) {
    log.info("Dodo dispute was not for a subscription payment", {
      dodo: { paymentId: dispute.payment_id, disputeId: dispute.dispute_id },
    });
    return null;
  }
  return await revokeSubscription(payment.subscription_id, eventAt, log, {
    paymentId: dispute.payment_id,
    cause: "dispute",
  });
}

/** Ends the period now and burns the window the user falls back onto. */
async function revokeSubscription(
  subscriptionId: string,
  eventAt: Date,
  log: AuditableLogger,
  context: { paymentId: string; cause: "refund" | "dispute" },
): Promise<string | null> {
  const rows = await db
    .update(subscription)
    .set({
      status: "cancelled",
      // Ending the period is what drops the user off Pro: the quota resolver
      // treats `cancelled` as entitling only while the period is still running.
      //
      // Deliberately our own clock, not `eventAt`. Dodo's timestamp can sit ahead
      // of ours (skew, or a refund recorded with a forward timestamp), and any
      // amount ahead leaves the period "still running" -- so the user keeps Pro
      // and the credit burn below lands on the Pro window instead of the Free one
      // they should have dropped to.
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: true,
      lastEventAt: eventAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscription.id, subscriptionId),
        // The same ordering guard the upsert uses. Dodo retries a refund for up to
        // 24 hours, and a delayed delivery must not roll newer state backwards.
        sql`${subscription.lastEventAt} <= ${eventAt.toISOString()}`,
      ),
    )
    .returning({ userId: subscription.userId });

  // Only rows this event actually updated are clawed back -- a row skipped by the
  // ordering guard keeps whatever a newer event said, credits included.
  if (rows.length === 0) {
    log.warn("Dodo clawback matched no subscription", {
      dodo: { subscriptionId, paymentId: context.paymentId, cause: context.cause },
    });
    return `${context.cause} matched no subscription (${subscriptionId})`;
  }

  for (const { userId } of rows) {
    // Resolved after the downgrade, so this exhausts the Free window the user
    // just fell back onto rather than the Pro one they no longer have.
    const actor = await getUserActor(userId);
    if (actor.planId === "pro") {
      // They resubscribed before this event arrived. The reversed period is ended
      // above, but the window they are on now is paid for and not ours to burn.
      log.warn("Dodo clawback skipped: user has another paid subscription", {
        dodo: { subscriptionId, cause: context.cause },
        userId,
      });
      continue;
    }
    await exhaustCreationQuota(actor);
    log.info("Dodo clawback applied", { dodo: { subscriptionId, cause: context.cause }, userId });
  }
  return null;
}
