ALTER TABLE "project" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cognee_dataset_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cognee_status" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "cognee_error" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "generation_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_file" ADD COLUMN "history" jsonb;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_source_check" CHECK ("source" IN ('manual', 'github_import'));--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_cognee_status_check" CHECK ("cognee_status" IN ('not_started', 'pending', 'ingesting', 'ready', 'failed', 'not_ready'));--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_generation_status_check" CHECK ("generation_status" IN ('none', 'queued', 'planning', 'creating', 'generating', 'done', 'failed'));
