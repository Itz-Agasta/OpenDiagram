CREATE TABLE "chatgpt_store" (
	"id" text PRIMARY KEY NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferred_source" text DEFAULT 'auto' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text,
	"base_url" text,
	"model_id" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"key_last4" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ai_preference" ADD CONSTRAINT "user_ai_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_provider" ADD CONSTRAINT "user_ai_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chatgpt_store_namespace_expires_at_idx" ON "chatgpt_store" USING btree ("namespace","expires_at");--> statement-breakpoint
CREATE INDEX "user_ai_provider_userId_idx" ON "user_ai_provider" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_provider_one_default_per_user_idx" ON "user_ai_provider" USING btree ("user_id") WHERE "user_ai_provider"."is_default" = true;