/**
 * Per-request AI cost accounting. Credits stay the user-facing unit ("150
 * diagrams" is legible), but this ledger is the real safety bound underneath:
 * one credit can cost 4x another depending on how many agent steps the model
 * takes, so counting requests cannot cap spend.
 *
 * Lifecycle: a row is inserted `reserved` at a pessimistic estimate before the
 * model runs, then either `settled` down to the measured token cost in
 * onFinish, or `released` to zero if the call failed. Releasing is also what
 * stops a model 503 from burning a paid credit.
 */
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { creationUsageActorTypes } from "./creation-usage";
import type { PlanId } from "./plan";

export const usageLedgerStatuses = ["reserved", "settled", "released"] as const;
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
    planId: text("plan_id").notNull().$type<PlanId>().default("free"),
    /**
     * The conversation turn this spend belongs to: one user message, however many
     * HTTP requests the agent loop needs to answer it.
     *
     * Credits are charged per turn, not per request. `ask_user` is a client-side
     * tool, so the model asking a clarifying question ends the HTTP turn and the
     * client resubmits -- which used to charge a second credit for the same prompt.
     * Null for paths with no conversation (repo generation), which are charged once
     * per job.
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
    // Ceiling check sums this on every AI request. Released rows are excluded
    // from the sum, so keep them out of the index entirely. `createdAt` is in the
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
    check("usage_ledger_cost_micros_check", sql`${table.costMicros} >= 0`),
  ],
);
