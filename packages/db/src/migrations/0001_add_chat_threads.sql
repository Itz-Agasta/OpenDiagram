CREATE TABLE "project_file_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"file_id" text,
	"title" text DEFAULT 'New chat' NOT NULL,
	"spec" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_file_message" (
	"thread_id" text NOT NULL,
	"seq" integer NOT NULL,
	"client_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_file_message_thread_id_seq_pk" PRIMARY KEY("thread_id","seq"),
	CONSTRAINT "project_file_message_role_check" CHECK ("project_file_message"."role" IN ('user', 'assistant')),
	CONSTRAINT "project_file_message_seq_check" CHECK ("project_file_message"."seq" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_file_thread" ADD CONSTRAINT "project_file_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_thread" ADD CONSTRAINT "project_file_thread_file_id_project_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."project_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_file_message" ADD CONSTRAINT "project_file_message_thread_id_project_file_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."project_file_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_file_thread_file_updated_idx" ON "project_file_thread" USING btree ("file_id","updated_at" desc);--> statement-breakpoint
CREATE INDEX "project_file_thread_project_updated_idx" ON "project_file_thread" USING btree ("project_id","updated_at" desc);