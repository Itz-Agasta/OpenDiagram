ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "cognee_dataset_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "cognee_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "cognee_error" text;
