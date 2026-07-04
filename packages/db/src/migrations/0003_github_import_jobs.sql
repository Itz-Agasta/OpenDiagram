CREATE TABLE "github_import_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"message" text NOT NULL,
	"error" text,
	"project_id" text,
	"project_name" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "github_import_job_status_check" CHECK ("status" IN ('queued', 'cloning', 'documenting', 'indexing', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "github_import_job" ADD CONSTRAINT "github_import_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "github_import_job" ADD CONSTRAINT "github_import_job_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "github_import_job_user_id_idx" ON "github_import_job" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "github_import_job_status_idx" ON "github_import_job" USING btree ("status");
