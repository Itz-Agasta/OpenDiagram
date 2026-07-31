CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"key_last4" text NOT NULL,
	"model_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_credits" integer NOT NULL,
	"signup_grant" integer NOT NULL,
	"daily_cap" integer NOT NULL,
	"ip_daily_cap_multiplier" integer DEFAULT 3 NOT NULL,
	"cost_ceiling_cents" integer NOT NULL,
	"burst_per_minute" integer NOT NULL,
	"max_concurrent" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_monthly_credits_check" CHECK ("plan"."monthly_credits" >= 0),
	CONSTRAINT "plan_signup_grant_check" CHECK ("plan"."signup_grant" >= 0),
	CONSTRAINT "plan_daily_cap_check" CHECK ("plan"."daily_cap" >= 0),
	CONSTRAINT "plan_ip_daily_cap_multiplier_check" CHECK ("plan"."ip_daily_cap_multiplier" >= 1),
	CONSTRAINT "plan_cost_ceiling_cents_check" CHECK ("plan"."cost_ceiling_cents" >= 0),
	CONSTRAINT "plan_burst_per_minute_check" CHECK ("plan"."burst_per_minute" >= 1),
	CONSTRAINT "plan_max_concurrent_check" CHECK ("plan"."max_concurrent" >= 1)
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_status_check" CHECK ("subscription"."status" IN ('pending', 'active', 'on_hold', 'cancelled', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"turn_id" text,
	"status" text DEFAULT 'reserved' NOT NULL,
	"route" text NOT NULL,
	"model_id" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micros" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp,
	CONSTRAINT "usage_ledger_cost_micros_check" CHECK ("usage_ledger"."cost_micros" >= 0),
	CONSTRAINT "usage_ledger_status_check" CHECK ("usage_ledger"."status" IN ('reserved', 'settled', 'refunded', 'released'))
);
--> statement-breakpoint
CREATE TABLE "creation_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"period" text DEFAULT 'month' NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creation_usage_actor_type_check" CHECK ("creation_usage"."actor_type" IN ('guest', 'user')),
	CONSTRAINT "creation_usage_period_check" CHECK ("creation_usage"."period" IN ('month', 'day')),
	CONSTRAINT "creation_usage_count_check" CHECK ("creation_usage"."count" >= 0)
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
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_metadata" jsonb,
	"generation_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_file" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_file_type_check" CHECK ("project_file"."type" IN ('diagram', 'doc'))
);
--> statement-breakpoint
CREATE TABLE "project_file_content" (
	"file_id" text PRIMARY KEY NOT NULL,
	"scene" jsonb,
	"spec" jsonb,
	"content" jsonb,
	"history" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_import_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"message" text NOT NULL,
	"error" text,
	"project_id" text,
	"project_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_provider" ADD CONSTRAINT "user_ai_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file" ADD CONSTRAINT "project_file_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_content" ADD CONSTRAINT "project_file_content_file_id_project_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_import_job" ADD CONSTRAINT "github_import_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_import_job" ADD CONSTRAINT "github_import_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_provider_user_provider_idx" ON "user_ai_provider" USING btree ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_provider_one_default_per_user_idx" ON "user_ai_provider" USING btree ("user_id") WHERE "user_ai_provider"."is_default" = true;--> statement-breakpoint
CREATE INDEX "subscription_user_status_idx" ON "subscription" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscription_plan_id_idx" ON "subscription" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "usage_ledger_actor_window_idx" ON "usage_ledger" USING btree ("actor_type","actor_id","window_start","plan_id","created_at") WHERE "usage_ledger"."status" <> 'released';--> statement-breakpoint
CREATE INDEX "usage_ledger_turn_idx" ON "usage_ledger" USING btree ("actor_type","actor_id","window_start","turn_id") WHERE "usage_ledger"."turn_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_ledger_plan_id_idx" ON "usage_ledger" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creation_usage_actor_window_idx" ON "creation_usage" USING btree ("actor_type","actor_id","period","window_start");--> statement-breakpoint
CREATE INDEX "webhook_event_created_at_idx" ON "webhook_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "project_userId_idx" ON "project" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_file_projectId_idx" ON "project_file" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "github_import_job_user_id_idx" ON "github_import_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "github_import_job_project_id_idx" ON "github_import_job" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_import_job_user_repo_partial_idx" ON "github_import_job" USING btree ("user_id","repo_full_name") WHERE status NOT IN ('done', 'failed');