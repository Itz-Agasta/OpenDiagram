CREATE TABLE "waitlist_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_key_hash" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_rate_limit_count_check" CHECK ("waitlist_rate_limit"."count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_rate_limit_actor_window_idx" ON "waitlist_rate_limit" USING btree ("actor_key_hash","window_start");