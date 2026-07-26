/**
 * Plan limits are DATA, not constants. Adding a tier is an INSERT; changing the
 * Pro credit count is an UPDATE with no deploy; a Gemini price rise becomes a
 * config change instead of a release. Nothing in apps/server may hardcode any
 * of these numbers.
 *
 * Invariant when changing monthlyCredits: costCeilingCents >= monthlyCredits x
 * p95 cost per diagram. Otherwise the ceiling binds before the advertised
 * credit limit and a paying user is cut off below what the UI promised.
 *
 * Deliberately absent: the Dodo product id. It is per-mode (test and live
 * products are different objects) and lives in DODO_PRO_PRODUCT_ID so that
 * going live is an env swap with no code or data change. Mirroring it here
 * would make the mode switch a two-place edit that silently half-applies.
 */
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * `guest` is a plan row even though nobody subscribes to it, so that the guest
 * allowance is data like every other limit rather than a constant in the server.
 */
export const planIds = ["guest", "free", "pro"] as const;
export type PlanId = (typeof planIds)[number];

export const plan = pgTable("plan", {
  id: text("id").primaryKey().$type<PlanId>(),
  name: text("name").notNull(),
  /** Platform diagrams per billing window. */
  monthlyCredits: integer("monthly_credits").notNull(),
  /**
   * One-time allowance for a new account's first billing window, replacing
   * monthlyCredits rather than adding to it. Users who reach a value moment in
   * their first session convert at ~5x, and 5 credits is not enough to take one
   * real system end to end.
   */
  signupGrant: integer("signup_grant").notNull(),
  /** Sub-cap that smooths spend and blocks a scripted drain of the window. */
  dailyCap: integer("daily_cap").notNull(),
  /**
   * Hard stop on AI spend per window. The real safety bound: a credit count
   * cannot bound cost when per-request cost varies ~4x with agent step count.
   */
  costCeilingCents: integer("cost_ceiling_cents").notNull(),
  burstPerMinute: integer("burst_per_minute").notNull(),
  maxConcurrent: integer("max_concurrent").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
