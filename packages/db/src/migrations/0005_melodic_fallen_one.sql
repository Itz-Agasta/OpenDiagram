CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_credits" integer NOT NULL,
	"signup_grant" integer NOT NULL,
	"daily_cap" integer NOT NULL,
	"cost_ceiling_cents" integer NOT NULL,
	"burst_per_minute" integer NOT NULL,
	"max_concurrent" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"dodo_customer_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_event_at" timestamp NOT NULL,
	"recurring_amount_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"route" text NOT NULL,
	"model_id" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micros" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp,
	CONSTRAINT "usage_ledger_cost_micros_check" CHECK ("usage_ledger"."cost_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "creation_usage_actor_window_idx";--> statement-breakpoint
ALTER TABLE "creation_usage" ADD COLUMN "period" text DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_user_status_idx" ON "subscription" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "usage_ledger_actor_window_idx" ON "usage_ledger" USING btree ("actor_type","actor_id","window_start") WHERE "usage_ledger"."status" <> 'released';--> statement-breakpoint
CREATE INDEX "webhook_event_created_at_idx" ON "webhook_event" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "creation_usage_actor_window_idx" ON "creation_usage" USING btree ("actor_type","actor_id","period","window_start");--> statement-breakpoint
ALTER TABLE "creation_usage" ADD CONSTRAINT "creation_usage_period_check" CHECK ("creation_usage"."period" IN ('month', 'day'));--> statement-breakpoint
INSERT INTO "plan" ("id","name","monthly_credits","signup_grant","daily_cap","cost_ceiling_cents","burst_per_minute","max_concurrent") VALUES
	('guest','Guest',3,0,3,10,2,1),
	('free','Free',5,25,5,60,5,2),
	('pro','Pro',150,0,25,325,5,2)
ON CONFLICT ("id") DO NOTHING;
