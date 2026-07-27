ALTER TABLE "plan" ADD COLUMN "ip_daily_cap_multiplier" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_monthly_credits_check" CHECK ("plan"."monthly_credits" >= 0);--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_signup_grant_check" CHECK ("plan"."signup_grant" >= 0);--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_daily_cap_check" CHECK ("plan"."daily_cap" >= 0);--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_ip_daily_cap_multiplier_check" CHECK ("plan"."ip_daily_cap_multiplier" >= 1);--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_cost_ceiling_cents_check" CHECK ("plan"."cost_ceiling_cents" >= 0);--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_burst_per_minute_check" CHECK ("plan"."burst_per_minute" >= 1);--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_max_concurrent_check" CHECK ("plan"."max_concurrent" >= 1);--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_status_check" CHECK ("usage_ledger"."status" IN ('reserved', 'settled', 'released'));