ALTER TABLE "project_file" ALTER COLUMN "history" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "github_import_job_user_repo_partial_idx" ON "github_import_job" USING btree ("user_id","repo_full_name") WHERE status NOT IN ('done', 'failed');--> statement-breakpoint
ALTER TABLE "project_file" ADD CONSTRAINT "project_file_type_check" CHECK ("project_file"."type" IN ('diagram', 'doc'));