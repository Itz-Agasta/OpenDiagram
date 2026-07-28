/** Mirror of a Dodo subscription. Written only by the webhook handler. */
import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../auth";
import { plan, type PlanId } from "./plan";

/** Mirrors the SDK's SubscriptionStatus union exactly. */
export const subscriptionStatuses = [
  "pending",
  "active",
  "on_hold",
  "cancelled",
  "failed",
  "expired",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

/**
 * Statuses that still grant paid access, always in combination with
 * `currentPeriodEnd > NOW()` -- that clause is what keeps this honest, since none of
 * them can hand out more than the period the user actually paid for.
 *
 * `cancelled` keeps access until the period ends: they paid for it. `on_hold` is the
 * same case seen from the other side -- the renewal for the *next* period failed
 * while the current one is still running, so the paid period is unaffected and Dodo
 * is retrying. It drops out by itself the moment `currentPeriodEnd` passes, because
 * Dodo only advances `next_billing_date` when a retry succeeds.
 *
 * This is the single definition of "entitled". The quota resolver and the checkout
 * duplicate guard both read it; when they disagreed, a cancelled-but-unexpired user
 * could buy a second overlapping subscription, and an on-hold one could be blocked
 * from checkout while getting no access either.
 */
export const ENTITLING_SUBSCRIPTION_STATUSES = ["active", "cancelled", "on_hold"] as const;

export const subscription = pgTable(
  "subscription",
  {
    /** The Dodo subscription id (`sub_...`) is the natural key. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dodoCustomerId: text("dodo_customer_id").notNull(),
    planId: text("plan_id")
      .notNull()
      .$type<PlanId>()
      .references(() => plan.id),
    status: text("status", { enum: subscriptionStatuses }).notNull(),
    /** Billing anchor. Quota windows roll on this date, not the calendar 1st. */
    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    /**
     * `timestamp` of the webhook event that last wrote this row. Dodo retries and
     * can deliver out of order; a stale event must not overwrite newer state.
     */
    lastEventAt: timestamp("last_event_at").notNull(),
    /** Cents actually charged, for reconciliation against Dodo payouts. */
    recurringAmountCents: integer("recurring_amount_cents").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Hot path: resolve a user's entitling subscription on every AI request.
    index("subscription_user_status_idx").on(table.userId, table.status),
    // Covers the `plan_id` foreign key, which nothing else indexes. Plan rows are
    // rarely touched, so this earns its keep only when one is renamed or removed
    // -- but that is exactly the operation that would otherwise scan this table.
    index("subscription_plan_id_idx").on(table.planId),
    // The drizzle enum is a TypeScript type only, and `ENTITLING_SUBSCRIPTION_STATUSES`
    // matches these values by name. A status Postgres accepted but that list does not
    // recognise reads as "not entitled", so a typo in a manual UPDATE or a future Dodo
    // status silently downgrades a paying user instead of failing.
    check(
      "subscription_status_check",
      sql`${table.status} IN ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired')`,
    ),
  ],
);

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, {
    fields: [subscription.userId],
    references: [user.id],
  }),
  plan: one(plan, {
    fields: [subscription.planId],
    references: [plan.id],
  }),
}));
