ALTER TABLE "project" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cognee_dataset_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cognee_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cognee_error" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "generation_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_file" ADD COLUMN "history" jsonb;