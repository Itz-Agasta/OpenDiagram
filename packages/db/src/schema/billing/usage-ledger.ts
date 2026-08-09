/**
 * Per-request AI cost accounting. One credit can cost 4x another depending on
 * agent steps, so counting requests can't cap spend.
 *
 * Lifecycle: inserted `reserved` before the model runs, resolved to:
 *   settled   -- real cost, credit kept (normal success)
 *   refunded  -- real cost, credit returned (burned tokens, still failed)
 *   released  -- no cost, credit returned (nothing reached the model)
 */
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { creationUsageActorTypes } from "./creation-usage";
import { plan, type PlanId } from "./plan";

export const usageLedgerStatuses = ["reserved", "settled", "refunded", "released"] as const;

/** Terminal states where the user got their credit back, so the turn is chargeable again. */
export const UNCHARGED_LEDGER_STATUSES = ["refunded", "released"] as const;
export type UsageLedgerStatus = (typeof usageLedgerStatuses)[number];

/**
 * Costs are stored in millionths of a USD. Token prices are quoted per million
 * tokens, so this keeps the whole calculation in integers -- an average diagram
 * is 11_600 micros ($0.0116) and would round to nothing in cents.
 */
export const MICROS_PER_CENT = 10_000;

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorType: text("actor_type", { enum: creationUsageActorTypes }).notNull(),
    actorId: text("actor_id").notNull(),
    /** The billing window this spend counts against. Matches creationUsage. */
    windowStart: timestamp("window_start").notNull(),
    /**
     * Which plan's ceiling this spend counts against.
     *
     * Without it, a Free anniversary window and a Pro subscription period that
     * happen to share a `windowStart` date read the same bucket. Upgrading errs
     * safe; downgrading mid-window does not -- Free's 60c ceiling would be measured
     * against up to 325c of logged Pro spend, so a user who cancels sees credits in
     * the UI and gets an immediate 429.
     */
    planId: text("plan_id")
      .notNull()
      .$type<PlanId>()
      .default("free")
      // Matches subscription.planId. Spend filed under a plan id that does not exist
      // is spend no ceiling check will ever read, so a typo would silently create an
      // unbounded bucket rather than failing.
      .references(() => plan.id),
    /**
     * Conversation turn this spend belongs to. Credits are per turn, not per HTTP
     * request. `ask_user` ends the turn and the client resubmits. Null for paths
     * with no conversation (repo generation).
     */
    turnId: text("turn_id"),
    status: text("status", { enum: usageLedgerStatuses }).default("reserved").notNull(),
    /** Which AI path spent this, for attributing cost when tuning prompts. */
    route: text("route").notNull(),
    modelId: text("model_id").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    settledAt: timestamp("settled_at"),
  },
  (table) => [
    // Ceiling check sums this on every AI request. Only `released` rows are excluded
    // from the sum (they cost nothing), so keep those out of the index entirely --
    // `refunded` rows carry real spend and must stay in it. `createdAt` is in the
    // index because the sum also filters abandoned reservations by age.
    index("usage_ledger_actor_window_idx")
      .on(table.actorType, table.actorId, table.windowStart, table.planId, table.createdAt)
      .where(sql`${table.status} <> 'released'`),
    // Rows stay one-per-request so cost accounting is exact; this index answers
    // the separate question the credit charge asks -- "how many requests has this
    // turn already made?" -- in one lookup.
    index("usage_ledger_turn_idx")
      .on(table.actorType, table.actorId, table.windowStart, table.turnId)
      .where(sql`${table.turnId} IS NOT NULL`),
    // Covers the `plan_id` foreign key. `usage_ledger_actor_window_idx` above
    // does contain `planId`, but as its fourth column and behind a partial
    // predicate, so Postgres cannot use it to satisfy the constraint check.
    index("usage_ledger_plan_id_idx").on(table.planId),
    check("usage_ledger_cost_micros_check", sql`${table.costMicros} >= 0`),
    // The drizzle enum is a TypeScript type only. The ceiling queries special-case
    // these values by name, so any other one written directly to Postgres would be
    // counted as permanent, unsettleable spend.
    check(
      "usage_ledger_status_check",
      sql`${table.status} IN ('reserved', 'settled', 'refunded', 'released')`,
    ),
  ],
);
