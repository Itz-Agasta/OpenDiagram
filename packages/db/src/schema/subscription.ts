/** Mirror of a Dodo subscription. Written only by the webhook handler. */
import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
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

/** Statuses that still grant paid access. `cancelled` keeps access until the period ends. */
export const ENTITLING_SUBSCRIPTION_STATUSES = ["active", "cancelled"] as const;

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
