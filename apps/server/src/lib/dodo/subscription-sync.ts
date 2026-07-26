/**
 * Applies Dodo subscription state to our `subscription` table.
 *
 * Split from the webhook route on purpose: that file owns *transport* concerns
 * (signature verification, idempotency, replay ordering) and this one owns what
 * an event *means* for entitlement. They change for unrelated reasons -- a Dodo
 * API shape change touches this file, a Standard Webhooks change touches that one.
 *
 * Only the webhook handler should call these. Entitlement follows what Dodo says
 * happened, never what a client claims.
 */
import { db, eq, sql } from "@OpenDiagram/db";
import { user } from "@OpenDiagram/db/schema/auth";
import { subscription, type SubscriptionStatus } from "@OpenDiagram/db/schema/subscription";
import type { Subscription } from "dodopayments/resources/subscriptions";
import { createLogger } from "evlog";
import { exhaustCreationQuota, getUserActor } from "../quota";
import { planIdForProduct } from "./client";

const log = createLogger({ module: "dodo-sync" });

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

export async function upsertSubscription(data: Subscription, eventAt: Date): Promise<void> {
  const userId = await resolveUserId(data);
  if (!userId) {
    // Not an error we can retry out of, so don't 500 and invite Dodo to hammer
    // us: record it and move on. A subscription we can't attribute is a support
    // ticket, not a transient failure.
    log.warn("Dodo subscription could not be matched to a user", {
      dodo: { subscriptionId: data.subscription_id, email: data.customer.email },
    });
    return;
  }

  const planId = planIdForProduct(data.product_id);
  if (!planId) {
    log.warn("Dodo subscription references an unknown product", {
      dodo: { subscriptionId: data.subscription_id, productId: data.product_id },
    });
    return;
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
      where: sql`${subscription.lastEventAt} <= ${eventAt.toISOString()}`,
    });

  log.info("Dodo subscription synced", {
    dodo: { subscriptionId: data.subscription_id, status: row.status, planId },
  });
}

/** Ends access now and burns the remaining credits of the window they fall back to. */
export async function clawback(dodoCustomerId: string, eventAt: Date): Promise<void> {
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
    .where(eq(subscription.dodoCustomerId, dodoCustomerId))
    .returning({ userId: subscription.userId });

  if (rows.length === 0) {
    log.warn("Dodo refund had no matching subscription", { dodo: { dodoCustomerId } });
    return;
  }

  for (const { userId } of rows) {
    // Resolved after the downgrade, so this exhausts the Free window the user
    // just fell back onto rather than the Pro one they no longer have.
    await exhaustCreationQuota(await getUserActor(userId));
    log.info("Dodo refund clawback applied", { dodo: { dodoCustomerId }, userId });
  }
}
