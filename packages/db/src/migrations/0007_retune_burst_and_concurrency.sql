-- Retunes the burst and concurrency limits. No schema change; values only.
--
-- The old numbers assumed one user prompt was one HTTP request. It isn't: the
-- `ask_user` tool is client-side, so the model asking a clarifying question ends
-- the HTTP turn and the client resubmits. A perfectly normal single prompt is
-- therefore 2+ requests, and guest burst=2 meant a first-time visitor could trip
-- "Too many requests" on their very first diagram -- observed, not theoretical.
--
-- maxConcurrent=1 for guests had the same cause: the automatic resubmission can
-- overlap the tail of the first stream, so 1 rejected the second half of a normal
-- turn with "Only 1 AI requests can run at once". 2 is the floor for a working
-- agent loop.
--
-- Pro was also limited *below* nothing useful at 2 concurrent -- repo generation
-- streams while a chat is open, which is 2 on its own.
--
-- Deliberately unchanged: monthlyCredits, signupGrant, dailyCap, costCeilingCents.
-- Those are the real spend bound and are calibrated in paymentplan.md §6b
-- (invariant: costCeilingCents >= monthlyCredits x p95 cost). Burst and
-- concurrency are only a spike damper keeping us inside Gemini's own rate limits;
-- they live in process memory, so on Cloud Run the effective limit is already
-- this value x instance count.
UPDATE "plan" SET "burst_per_minute" = 6,  "max_concurrent" = 2, "updated_at" = now() WHERE "id" = 'guest';--> statement-breakpoint
UPDATE "plan" SET "burst_per_minute" = 10, "max_concurrent" = 2, "updated_at" = now() WHERE "id" = 'free';--> statement-breakpoint
UPDATE "plan" SET "burst_per_minute" = 15, "max_concurrent" = 4, "updated_at" = now() WHERE "id" = 'pro';
