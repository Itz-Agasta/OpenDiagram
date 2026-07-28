-- usage_ledger gains two columns.
--
-- plan_id: which plan's ceiling a row counts against. Without it, a Free
-- anniversary window and a Pro subscription period sharing a window_start date
-- read the same bucket -- harmless when upgrading, but on a mid-window downgrade
-- Free's 60c ceiling gets measured against up to 325c of Pro spend, so a user who
-- cancels sees credits in the UI and is refused immediately. Existing rows default
-- to 'free'; that is a guess, but the only pre-existing rows are pre-launch test
-- data and the column cannot be null.
--
-- turn_id: the conversation turn a row belongs to, so a credit covers one user
-- message rather than one HTTP request. `ask_user` is a client-side tool, so the
-- model asking a clarifying question ends the request and the client resubmits --
-- which charged a second credit for the same prompt. Null for paths with no
-- conversation (repo generation), which are charged once per job.
--
-- The actor/window index gains plan_id and created_at because the ceiling sum now
-- filters on both.
DROP INDEX "usage_ledger_actor_window_idx";--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD COLUMN "plan_id" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD COLUMN "turn_id" text;--> statement-breakpoint
CREATE INDEX "usage_ledger_turn_idx" ON "usage_ledger" USING btree ("actor_type","actor_id","window_start","turn_id") WHERE "usage_ledger"."turn_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_ledger_actor_window_idx" ON "usage_ledger" USING btree ("actor_type","actor_id","window_start","plan_id","created_at") WHERE "usage_ledger"."status" <> 'released';