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
import { and, db, eq, sql } from "@OpenDiagram/db";
import { user } from "@OpenDiagram/db/schema/auth";
import { subscription } from "@OpenDiagram/db/schema/subscription";
import { env } from "@OpenDiagram/env/server";
import { createLogger } from "evlog";
import { Hono } from "hono";
import { z } from "zod";
import { appOrigin, dodoClient } from "../lib/dodo";
import { getUserActor } from "../lib/quota";
import { type AuthVariables, requireAuth } from "../lib/require-auth";

const log = createLogger({ module: "billing" });

const checkoutSchema = z.object({
  /** Optional promo code, e.g. LAUNCH. Dodo validates and rejects it, not us. */
  discountCode: z.string().trim().min(1).max(64).optional(),
});

export const billingRoute = new Hono<{ Variables: AuthVariables }>();

billingRoute.use("*", requireAuth);

/** Current plan and subscription state, for the pricing and settings pages. */
billingRoute.get("/", async (c) => {
  const userId = c.get("userId");
  const actor = await getUserActor(userId);
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
    // self-hosted instance instead of linking to a route that 404s.
    billingEnabled: dodoClient() !== null,
    planId: actor.planId,
    credits: { limit: actor.limit, resetAt: actor.resetAt?.toISOString() ?? null },
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
  const client = dodoClient();
  if (!client || !env.DODO_PRO_PRODUCT_ID) {
    return c.json({ error: "Billing is not configured." }, 404);
  }

  const userId = c.get("userId");
  const parsed = checkoutSchema.safeParse((await c.req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  // Already paying: send them to the portal to change the plan instead of
  // stacking a second subscription on the same account.
  const [active] = await db
    .select({ id: subscription.id })
    .from(subscription)
    .where(
      and(
        eq(subscription.userId, userId),
        sql`${subscription.status} = 'active'`,
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

  try {
    const checkout = await client.checkoutSessions.create({
      product_cart: [{ product_id: env.DODO_PRO_PRODUCT_ID, quantity: 1 }],
      customer: { email: account.email, name: account.name },
      // The webhook resolves entitlement from this, so it is not optional --
      // without it a paid subscription can only be matched back by email.
      metadata: { userId },
      ...(parsed.data.discountCode ? { discount_code: parsed.data.discountCode } : {}),
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

    log.info("Dodo checkout session created", {
      dodo: { sessionId: checkout.session_id, discountCode: parsed.data.discountCode ?? null },
    });
    return c.json({ checkoutUrl: checkout.checkout_url });
  } catch (error) {
    log.error("Dodo checkout session failed", { error });
    return c.json({ error: "Could not start checkout." }, 502);
  }
});

/** Dodo-hosted portal: cancel, resume, update the payment method, get invoices. */
billingRoute.post("/portal", async (c) => {
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
    log.error("Dodo customer portal failed", { error });
    return c.json({ error: "Could not open the billing portal." }, 502);
  }
});
