/**
 * Checkout and customer-portal links.
 *
 * Both go through Dodo-hosted pages rather than a card form of ours. Dodo is the
 * Merchant of Record, so their page is what computes VAT/GST from the billing
 * address, runs 3DS/SCA, and stores the card -- reimplementing any of that on our
 * side would be strictly worse and put us in PCI scope.
 *
 * Both 404 when billing is unconfigured, which is the OSS self-host default.
 */
import { and, db, eq, inArray, ne, sql } from "@OpenDiagram/db";
import { user } from "@OpenDiagram/db/schema/auth";
import { ENTITLING_SUBSCRIPTION_STATUSES, subscription } from "@OpenDiagram/db/schema/billing";
import { env } from "@OpenDiagram/env/server";
import { Hono } from "hono";
import { z } from "zod";
import { appOrigin, billingEnabled, dodoClient } from "../lib/dodo";
// Deliberately not via the `dodo` barrel: keeping this import explicit is what
// stops an arbitrary route picking up a writer for the `subscription` table.
// Only the webhook and `POST /reconcile` below may call it.
import { upsertSubscription } from "../lib/dodo/subscription-sync";
import { enforceAiBurst, getPlan, getUserActor, quotaErrorResponse } from "../lib/quota";
import { type AuthVariables, requireAuth } from "../lib/require-auth";

const checkoutSchema = z.object({
  /** Optional promo code, e.g. LAUNCH. Dodo validates the code itself; who may
   *  redeem it is enforced here -- see `mayRedeemDiscount`. */
  discountCode: z.string().trim().min(1).max(64).optional(),
});

/**
 * Whether this user may have a promo code applied to their checkout.
 *
 * This has to be our decision, because Dodo's is not enforced. Measured against
 * the test-mode API on 2026-07-28: with `customer_eligibility: "first_time"` AND
 * `per_customer_usage_limit: 1` set on the LAUNCH discount, a customer holding an
 * active subscription and three prior redemptions was still shown "you're saving
 * 37.5%" -- both when the code was pre-applied to the session and when they typed
 * it into Dodo's hosted page themselves. Neither restriction bound. The only Dodo
 * cap that demonstrably holds is `usage_limit`, which counts *attempts* rather
 * than sales, so failed payments burn it too.
 *
 * Left alone, that is a $5 price every month for anyone willing to resubscribe.
 *
 * `failed` rows are deliberately not disqualifying: the mandate was never created
 * and no money moved, so a declined card would otherwise cost a genuine buyer the
 * launch price on their retry. Every other status -- including `cancelled` and
 * `expired` -- means a sale completed at some point.
 */
async function mayRedeemDiscount(userId: string): Promise<boolean> {
  const [prior] = await db
    .select({ id: subscription.id })
    .from(subscription)
    .where(and(eq(subscription.userId, userId), ne(subscription.status, "failed")))
    .limit(1);
  return !prior;
}

export const billingRoute = new Hono<{ Variables: AuthVariables }>();

billingRoute.use("*", requireAuth);

/** Current plan and subscription state, for the pricing and settings pages. */
billingRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const actor = await getUserActor(userId, c);
  const [row] = await db
    .select({
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .orderBy(sql`${subscription.currentPeriodEnd} DESC`)
    .limit(1);

  return c.json({
    // `billingEnabled: false` is how the web app knows to hide upgrade UI on a
    // self-hosted instance instead of linking to a route that 404s. It requires
    // every DODO_* setting, not just the API key -- see billingEnabled().
    billingEnabled: billingEnabled(),
    planId: actor.planId,
    credits: { limit: actor.limit, resetAt: actor.resetAt?.toISOString() ?? null },
    // What Pro buys, so the pricing copy states the enforced number instead of a
    // literal that goes stale the moment the plan row is retuned.
    proCredits: (await getPlan("pro")).monthlyCredits,
    subscription: row
      ? {
          status: row.status,
          currentPeriodEnd: row.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        }
      : null,
  });
});

billingRoute.post("/checkout", async (c) => {
  const log = c.get("log");
  const client = dodoClient();
  // `DODO_PRO_PRODUCT_ID` is re-checked rather than left to billingEnabled() so it
  // narrows to a string for the product_cart below.
  if (!client || !billingEnabled() || !env.DODO_PRO_PRODUCT_ID) {
    return c.json({ error: "Billing is not configured." }, 404);
  }

  const userId = c.get("userId");
  const parsed = checkoutSchema.safeParse((await c.req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  // Already paying: send them to the portal to change the plan instead of
  // stacking a second subscription on the same account.
  //
  // Exactly the predicate the quota resolver uses, deliberately: "still has paid
  // access" is one question and must have one answer. `active` alone let someone who
  // had cancelled buy a second overlapping subscription; anything wider than the
  // entitling set would block a user who has no access from buying any.
  const [active] = await db
    .select({ id: subscription.id })
    .from(subscription)
    .where(
      and(
        eq(subscription.userId, userId),
        inArray(subscription.status, [...ENTITLING_SUBSCRIPTION_STATUSES]),
        sql`${subscription.currentPeriodEnd} > NOW()`,
      ),
    )
    .limit(1);
  if (active) {
    return c.json(
      { error: "This account already has an active subscription.", code: "already_subscribed" },
      409,
    );
  }

  const [account] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!account) return c.json({ error: "Unauthorized" }, 401);

  // Applied only for a user who has never completed a sale. Dodo does not enforce
  // this itself (see `mayRedeemDiscount`), so this call is the enforcement.
  //
  // Refused out loud rather than dropped silently: a user who typed a code and
  // then landed on a full-price page with no discount field -- because the branch
  // below turns it off -- would have no way to tell whether the code failed, the
  // page was broken, or they were being overcharged.
  const discountCode = parsed.data.discountCode;
  if (discountCode && !(await mayRedeemDiscount(userId))) {
    log.info("Checkout discount refused: not a first-time subscriber", {
      dodo: { discountRequested: discountCode },
    });
    return c.json(
      {
        error: "That code is only valid on a first subscription.",
        code: "discount_not_eligible",
      },
      409,
    );
  }

  try {
    const checkout = await client.checkoutSessions.create({
      product_cart: [{ product_id: env.DODO_PRO_PRODUCT_ID, quantity: 1 }],
      customer: { email: account.email, name: account.name },
      // The webhook resolves entitlement from this, so it is not optional --
      // without it a paid subscription can only be matched back by email.
      metadata: { userId },
      // Two mutually exclusive shapes, and Dodo rejects the pair outright
      // ("Discount code is not allowed if allow_discount_code is false"):
      //
      // - Code forwarded: Dodo renders it pre-applied and *disabled*, so it is
      //   locked to the one we authorised.
      // - No code: the hosted page otherwise shows an "Apply discount code" field
      //   by default (`allow_discount_code` defaults to true), and a returning
      //   customer typing LAUNCH into it was measured to get the discount. Turning
      //   the field off is what stops a server-side gate being trivially bypassed
      //   on Dodo's own page.
      //
      // `discount_codes` rather than `discount_code`: the singular field is marked
      // @deprecated in the SDK, and revenue should not rest on a deprecated field.
      ...(discountCode
        ? { discount_codes: [discountCode] }
        : { feature_flags: { allow_discount_code: false } }),
      // Derived from CORS_ORIGIN rather than its own env var: one more billing
      // variable to forget at deploy time, for a value we already know.
      return_url: `${appOrigin()}/dashboard?checkout=success`,
    });

    if (!checkout.checkout_url) {
      log.error("Dodo checkout session came back without a URL", {
        dodo: { sessionId: checkout.session_id },
      });
      return c.json({ error: "Could not start checkout." }, 502);
    }

    // Only the applied code. A refusal cannot reach this line -- it returned 409
    // above -- and logs its own line there, so a second "requested" field here
    // would always be identical to this one.
    log.info("Dodo checkout session created", {
      dodo: { sessionId: checkout.session_id, discountCode: discountCode ?? null },
    });
    return c.json({ checkoutUrl: checkout.checkout_url });
  } catch (error) {
    // Error first, context second -- see routes/webhooks/dodo.ts. The inverted
    // shape drops the reason, and "why did checkout fail" is the whole question
    // here: an invalid discount code, a rejected product id and a Dodo outage all
    // reach this line and want different responses.
    log.error(error instanceof Error ? error : String(error), {
      dodo: { stage: "checkout-session" },
    });
    return c.json({ error: "Could not start checkout." }, 502);
  }
});

/** Dodo-hosted portal: cancel, resume, update the payment method, get invoices. */
billingRoute.post("/portal", async (c) => {
  const log = c.get("log");
  const client = dodoClient();
  if (!client) return c.json({ error: "Billing is not configured." }, 404);

  const userId = c.get("userId");
  const [row] = await db
    .select({ dodoCustomerId: subscription.dodoCustomerId })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .orderBy(sql`${subscription.currentPeriodEnd} DESC`)
    .limit(1);

  // No Dodo customer exists until the first checkout completes, so there is
  // nothing to open rather than an error to report.
  if (!row) return c.json({ error: "No subscription to manage.", code: "no_subscription" }, 404);

  try {
    const portal = await client.customers.customerPortal.create(row.dodoCustomerId, {
      return_url: `${appOrigin()}/dashboard/settings`,
    });
    return c.json({ portalUrl: portal.link });
  } catch (error) {
    log.error(error instanceof Error ? error : String(error), {
      dodo: { stage: "customer-portal" },
    });
    return c.json({ error: "Could not open the billing portal." }, 502);
  }
});

const reconcileSchema = z.object({
  /** Dodo appends this to `return_url` itself; it is untrusted input all the same. */
  subscriptionId: z.string().trim().min(1).max(128),
});

/**
 * Second path to entitlement, for the moment the buyer is standing on the return
 * page waiting for Pro to appear.
 *
 * The webhook stays the authority -- it is the only thing that covers renewals,
 * cancellations and refunds, and the only thing that fires when the customer
 * closes the tab before redirecting. But it is also a single point of failure at
 * the one moment a user is watching, and a lost delivery means money taken and
 * nothing granted. Both Stripe and Dodo prescribe running the two together:
 * Dodo's FAQ is "always listen for the webhook OR query the API to confirm the
 * transaction after redirect", and Stripe labels the landing-page path
 * "Recommended" for exactly this reason.
 *
 * Two rules make it safe to have a second writer:
 *
 * 1. **The query parameter proves nothing.** Dodo's own guidance is to treat a
 *    redirect as a user-facing confirmation, not proof of payment -- the params
 *    are trivially forged. So the id is only ever used to *look up* the truth from
 *    Dodo, and the subscription is then checked to actually belong to the caller.
 *    Without that check this endpoint would hand anyone Pro for a guessed id.
 * 2. **It converges with the webhook rather than racing it.** It calls the same
 *    `upsertSubscription`, so the same `lastEventAt` ordering guard applies and
 *    whichever path lands second is a no-op.
 */
billingRoute.post("/reconcile", async (c) => {
  const log = c.get("log");
  const client = dodoClient();
  if (!client) return c.json({ error: "Billing is not configured." }, 404);

  const userId = c.get("userId");

  // Every call below spends an outbound Dodo API request on an id the caller
  // chose, so without a cap an authenticated user can walk subscription ids at
  // our expense. Ids are long and random enough that a hit is implausible -- the
  // cost is unmetered egress and Dodo rate-limit pressure, not exposure. The
  // per-plan burst bucket already exists and is the right size for a call a real
  // user makes once per checkout, so this reuses it rather than adding a second
  // limiter with its own semantics.
  try {
    await enforceAiBurst(c, "billing-reconcile", userId);
  } catch (error) {
    const response = quotaErrorResponse(c, error);
    if (response) return response;
    throw error;
  }

  const parsed = reconcileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
  const { subscriptionId } = parsed.data;

  let remote: Awaited<ReturnType<typeof client.subscriptions.retrieve>>;
  try {
    remote = await client.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    // A forged or stale id lands here. Nothing is written and nothing is leaked
    // about whether the id exists.
    // Stays a `warn` with the reason flattened to a string, rather than
    // `log.error(error, ...)`: a forged or stale id is the expected way into this
    // branch, and escalating it to `error` would page on every one of them. The
    // string keeps the cause readable without the raw Error serialising to `{}`.
    log.warn("Post-checkout reconcile could not load the subscription", {
      dodo: {
        subscriptionId,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
    return c.json({ error: "Could not confirm the subscription." }, 404);
  }

  // Ownership, from Dodo's copy rather than the caller's claim, and on
  // `metadata.userId` ONLY.
  //
  // `upsertSubscription` also accepts an email match, which is right for the
  // webhook: it has to attribute a subscription created straight from the Dodo
  // dashboard. Here it would be an account-takeover primitive. Email verification
  // is a soft gate (HANDOVER.md §3.7), so anyone can hold an unverified account on
  // an address they don't own -- and matching on it would let them claim the
  // subscription of a customer who paid but never signed up. There is no cost to
  // dropping it: this path only ever runs after *our* checkout, which always
  // stamps `metadata.userId`.
  //
  // Dodo types metadata values as string | number | boolean, so narrow first.
  const claimedBy = remote.metadata?.userId;
  if (typeof claimedBy !== "string" || claimedBy !== userId) {
    log.warn("Post-checkout reconcile rejected: subscription is not the caller's", {
      dodo: { subscriptionId },
      userId,
    });
    // Same 404 and body as an unknown id above, deliberately: distinguishing
    // "exists but not yours" from "does not exist" turns this into an oracle for
    // probing which subscription ids are real.
    return c.json({ error: "Could not confirm the subscription." }, 404);
  }

  // `insertOnly`, so this write never competes with the webhook for ordering. The
  // snapshot carries no provider timestamp -- `created_at` dates the subscription,
  // not the read -- so any watermark this could invent is wrong in one direction
  // or the other: our own clock can run ahead of Dodo's and suppress a genuinely
  // later cancellation, and `created_at` is older than every webhook the
  // subscription will ever emit. Seeding only when no row exists sidesteps the
  // choice: reconcile grants the initial entitlement, and the moment a row exists
  // the webhook owns it. `created_at` is still passed so the seeded watermark
  // stays in Dodo's clock domain.
  let skipped: string | null;
  try {
    skipped = await upsertSubscription(remote, new Date(remote.created_at), log, {
      insertOnly: true,
    });
  } catch (error) {
    // `upsertSubscription` throws on an unknown product, which is a misconfigured
    // `DODO_PRO_PRODUCT_ID` -- our fault, not the caller's. Without this the throw
    // reaches Hono's global handler with no billing-level log, and every reconcile
    // 500s with nothing saying why.
    log.error(error instanceof Error ? error : String(error), {
      dodo: { stage: "reconcile", subscriptionId },
    });
    return c.json({ error: "Could not confirm the subscription." }, 502);
  }
  if (skipped) {
    log.warn("Post-checkout reconcile did not apply", { dodo: { subscriptionId, skipped } });
    return c.json({ error: "Could not confirm the subscription." }, 409);
  }

  // Resolved after the upsert on purpose, so it reports the plan the payment
  // just bought rather than the one the caller had a moment ago.
  const actor = await getUserActor(userId, c);
  log.info("Post-checkout reconcile applied", { dodo: { subscriptionId }, plan: actor.planId });
  return c.json({ planId: actor.planId, status: remote.status });
});
