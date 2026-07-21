CREATE TABLE "creation_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creation_usage_actor_type_check" CHECK ("creation_usage"."actor_type" IN ('guest', 'user')),
	CONSTRAINT "creation_usage_count_check" CHECK ("creation_usage"."count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "creation_usage_actor_window_idx" ON "creation_usage" USING btree ("actor_type","actor_id","window_start");