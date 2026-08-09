/**
 * Seeds the `plan` table -- the only data the app can't boot without. Plans are
 * configuration, not user data; every quota decision reads them. This file is the
 * source of truth: change a limit here, commit, `bun run db:seed`.
 * Server caches plans for 60s (`PLAN_CACHE_TTL_MS` in `lib/quota/actor.ts`).
 */
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { plan } from "./schema/billing";

dotenv.config({
  path: "../../apps/server/.env",
});

const plans: (typeof plan.$inferInsert)[] = [
  {
    id: "guest",
    name: "Guest",
    monthlyCredits: 3,
    signupGrant: 0,
    dailyCap: 3,
    ipDailyCapMultiplier: 3,
    costCeilingCents: 10,
    burstPerMinute: 6,
    maxConcurrent: 2,
  },
  {
    id: "free",
    name: "Free",
    monthlyCredits: 5,
    signupGrant: 25,
    dailyCap: 10,
    ipDailyCapMultiplier: 3,
    costCeilingCents: 60,
    burstPerMinute: 10,
    maxConcurrent: 2,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyCredits: 150,
    signupGrant: 0,
    dailyCap: 25,
    ipDailyCapMultiplier: 3,
    costCeilingCents: 325,
    burstPerMinute: 15,
    maxConcurrent: 4,
  },
];

/** Every column this file owns. `id` keys the row; the timestamps are the DB's. */
const managedColumns = [
  "name",
  "monthlyCredits",
  "signupGrant",
  "dailyCap",
  "ipDailyCapMultiplier",
  "costCeilingCents",
  "burstPerMinute",
  "maxConcurrent",
] as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const dryRun = process.argv.includes("--dry-run");
  const db = drizzle(url);

  try {
    // Diffed in advance rather than blind-upserting, because this runs against
    // production billing limits: it prints what it is about to change, and rows
    // that already match are left alone so `updated_at` still means "when this
    // limit last actually moved".
    const live = new Map((await db.select().from(plan)).map((row) => [row.id, row]));

    const pending = plans.flatMap((next) => {
      const current = live.get(next.id as (typeof plans)[number]["id"]);
      if (!current) return [{ row: next, label: `+ ${next.id} (new)` }];

      const diff = managedColumns
        .filter((key) => current[key] !== next[key])
        .map((key) => `${key} ${current[key]} -> ${next[key]}`);

      return diff.length ? [{ row: next, label: `~ ${next.id}: ${diff.join(", ")}` }] : [];
    });

    if (pending.length === 0) {
      console.log("plan: database already matches this file, nothing to apply.");
      return;
    }

    for (const change of pending) console.log(change.label);

    if (dryRun) {
      console.log(`\n--dry-run: ${pending.length} change(s) not written.`);
      return;
    }

    await db
      .insert(plan)
      .values(pending.map((change) => change.row))
      .onConflictDoUpdate({
        target: plan.id,
        set: {
          name: sql`excluded.name`,
          monthlyCredits: sql`excluded.monthly_credits`,
          signupGrant: sql`excluded.signup_grant`,
          dailyCap: sql`excluded.daily_cap`,
          ipDailyCapMultiplier: sql`excluded.ip_daily_cap_multiplier`,
          costCeilingCents: sql`excluded.cost_ceiling_cents`,
          burstPerMinute: sql`excluded.burst_per_minute`,
          maxConcurrent: sql`excluded.max_concurrent`,
          updatedAt: new Date(),
        },
      });

    console.log(`\nplan: ${pending.length} change(s) applied.`);
  } finally {
    // The pool holds the process open, so close it explicitly -- a seed that hangs
    // in a deploy step looks the same as one that stalled.
    await db.$client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
