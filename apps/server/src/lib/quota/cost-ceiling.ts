/**
 * The real bound on what one account can spend in a billing window. Credits
 * alone can't do this job: one credit buys anywhere from 3 to 6 agent steps and
 * the cost varies about 4x with it, so counting requests doesn't cap spend.
 *
 * Each AI call reserves a pessimistic amount before the model runs, then settles
 * down to the measured token cost. A call that failed after burning tokens settles
 * too and refunds only the credit; releasing to zero is reserved for a call that
 * never reached the model, which is what stops a 503 from charging for nothing.
 */
import { and, db, eq, notInArray, sql } from "@OpenDiagram/db";
import {
  MICROS_PER_CENT,
  UNCHARGED_LEDGER_STATUSES,
  usageLedger,
} from "@OpenDiagram/db/schema/billing";
import type { CreationQuotaActor } from "./actor";
import { CostCeilingExceededError } from "./errors";

/**
 * USD per million tokens. A vendor fact rather than a product decision, so it
 * lives next to the metering instead of in the plan table -- but it still has to
 * be maintained: gemini-2.5-flash went from $0.15/$0.60 to $0.30/$2.50 in one
 * pricing change, a 4x jump on output.
 */
const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
};

// Charged when a model has no entry above. Deliberately the priciest rate we've
// seen, so an unpriced model over-reports rather than running effectively free.
const UNKNOWN_MODEL_PRICING = { inputPerMillion: 1.5, outputPerMillion: 9.0 };

/**
 * Reserved up front, in micro-dollars. This is the p95 measured cost of a real
 * diagram run ($0.0214), not the average -- reserving the average would let a
 * heavy run start when there's no budget left to finish it.
 */
const PESSIMISTIC_RESERVE_MICROS = 21_400;

const MICROS_PER_USD = 1_000_000;

/**
 * How long a reservation is trusted before it's treated as abandoned.
 *
 * A grant is settled in `onFinish` and released in `onError`, but a client that
 * disconnects mid-stream (tab close, navigation) fires neither, leaving the row
 * `reserved` forever. Without this, that phantom 21,400 micros counts against the
 * ceiling until the billing window rolls -- roughly 28 abandoned streams silently
 * exhaust a Free account, 4 a guest, without either ever seeing a diagram.
 *
 * Filtering in the read rather than reaping in a job is deliberate: Cloud Run
 * scales to zero and the server has no scheduler, so there is nothing to run a
 * reaper in. The bound this weakens is the concurrent-overshoot window, which the
 * concurrency cap already keeps small.
 *
 * Longer than the longest realistic run: the agent loop can take six steps and
 * `streamText` retries three times, against a 120s server idle timeout.
 *
 * Expressed in minutes and applied as a SQL interval on purpose. `created_at` is a
 * `timestamp` written by Postgres' own `now()`, so the cutoff has to be computed on
 * the database clock. Passing a JS `Date` instead lets the driver serialize it in
 * the server process's local timezone, which silently shifts the comparison by the
 * UTC offset -- on a +05:30 machine the cutoff lands in the future, every row looks
 * stale, and the ceiling stops seeing any spend at all.
 */
const RESERVATION_TTL_MINUTES = 10;

/**
 * How many HTTP requests one turn may put on a single credit.
 *
 * The turn id comes from the client, so it is untrusted: a caller that reuses one
 * forever would otherwise get unlimited requests for one credit, bypassing both the
 * credit count and the daily cap and leaving only the cost ceiling in the way. Past
 * this count the turn is treated as a new one and charged again.
 *
 * A real turn is 1-3 requests: the first, plus one per `ask_user` round trip, which
 * the model asks at most once or twice in practice. 5 leaves headroom without making
 * the bypass worth attempting.
 */
const MAX_REQUESTS_PER_TURN = 5;

export function costMicros(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[modelId] ?? UNKNOWN_MODEL_PRICING;
  const usd =
    (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000;
  return Math.round(usd * MICROS_PER_USD);
}

async function spentMicros(actor: CreationQuotaActor): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${usageLedger.costMicros}), 0)`.as("total") })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.actorType, actor.actorType),
        eq(usageLedger.actorId, actor.actorId),
        eq(usageLedger.windowStart, actor.windowStart),
        // Scoped to the plan, so a Free window and a Pro period that share a
        // windowStart date can't read each other's spend.
        eq(usageLedger.planId, actor.planId),
        // Only `released` is excluded: those cost nothing. `refunded` rows gave the
        // credit back but still cost us tokens, so they count like any other spend.
        sql`${usageLedger.status} <> 'released'`,
        // A settled row is real spend and always counts. A still-`reserved` row
        // only counts while it could plausibly still be running -- see
        // RESERVATION_TTL_MINUTES for why an abandoned one must stop counting.
        sql`(${usageLedger.status} <> 'reserved'
             OR ${usageLedger.createdAt} > NOW() - ${sql.raw(`INTERVAL '${RESERVATION_TTL_MINUTES} minutes'`)})`,
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Reserves budget for one AI call, returning the ledger row id the caller must
 * later settle or release.
 *
 * Two requests racing here can both pass the check and overshoot by one
 * reservation each. The bound is `maxConcurrent x live instances x 21_400` micros,
 * not `maxConcurrent x 21_400`: the concurrency cap is per process (see enforce.ts),
 * so on Cloud Run it scales with instance count. At Pro's cap of 4 that is ~8.6c per
 * instance against a 325c ceiling -- still far too cheap to justify a serializable
 * transaction on the hot path, but it is not the single-instance figure this comment
 * used to quote.
 */
export async function reserveAiCost(
  actor: CreationQuotaActor,
  meta: { route: string; modelId: string; turnId?: string },
): Promise<string> {
  const ceiling = actor.plan.costCeilingCents * MICROS_PER_CENT;
  if ((await spentMicros(actor)) + PESSIMISTIC_RESERVE_MICROS > ceiling) {
    throw new CostCeilingExceededError(actor.plan.costCeilingCents);
  }

  const [row] = await db
    .insert(usageLedger)
    .values({
      actorType: actor.actorType,
      actorId: actor.actorId,
      windowStart: actor.windowStart,
      planId: actor.planId,
      turnId: meta.turnId,
      status: "reserved",
      route: meta.route,
      modelId: meta.modelId,
      costMicros: PESSIMISTIC_RESERVE_MICROS,
    })
    .returning({ id: usageLedger.id });

  if (!row) throw new Error("Failed to reserve AI cost");
  return row.id;
}

/**
 * Whether this request continues a turn we already charged a credit for.
 *
 * The cost of every request is still metered individually -- only the *credit* is
 * per turn. Capped at MAX_REQUESTS_PER_TURN because the turn id is client-supplied.
 *
 * Rows whose credit was handed back don't count, whatever they cost us. A turn whose
 * only request failed has *not* been charged, so counting its row would make the
 * retry free and hand a caller who can reliably provoke a failure
 * MAX_REQUESTS_PER_TURN of them for nothing. An `ask_user` continuation is
 * unaffected: the request it continues settled and kept its credit.
 *
 * Two requests sharing a turn id can race here and both read 0, charging two
 * credits for one turn. In practice they don't: the client only resubmits after the
 * previous response completed. Same tradeoff as the ceiling race above -- a
 * serializable transaction on the hot path isn't worth one credit.
 */
export async function isTurnAlreadyCharged(
  actor: CreationQuotaActor,
  turnId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ requests: sql<string>`count(*)`.as("requests") })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.actorType, actor.actorType),
        eq(usageLedger.actorId, actor.actorId),
        eq(usageLedger.windowStart, actor.windowStart),
        eq(usageLedger.planId, actor.planId),
        eq(usageLedger.turnId, turnId),
        notInArray(usageLedger.status, [...UNCHARGED_LEDGER_STATUSES]),
      ),
    );
  const requests = Number(row?.requests ?? 0);
  return requests > 0 && requests < MAX_REQUESTS_PER_TURN;
}

/**
 * Reconciles a reservation to what the model actually used.
 *
 * `creditRefunded` picks the terminal status: `refunded` when the tokens were spent
 * but the user got their credit back, `settled` otherwise. The cost counts either
 * way -- the difference is only whether the turn still looks charged.
 */
export async function settleAiCost(
  ledgerId: string,
  usage: { modelId: string; inputTokens: number; outputTokens: number },
  options: { creditRefunded?: boolean } = {},
): Promise<void> {
  await db
    .update(usageLedger)
    .set({
      status: options.creditRefunded ? "refunded" : "settled",
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costMicros: costMicros(usage.modelId, usage.inputTokens, usage.outputTokens),
      settledAt: new Date(),
    })
    .where(eq(usageLedger.id, ledgerId));
}

/** Zeroes a reservation whose call produced nothing billable. */
export async function releaseAiCost(ledgerId: string): Promise<void> {
  await db
    .update(usageLedger)
    .set({ status: "released", costMicros: 0, settledAt: new Date() })
    .where(eq(usageLedger.id, ledgerId));
}
