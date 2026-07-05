import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "./auth";
import { project } from "./project";

export const githubImportJobStatuses = [
  "queued",
  "cloning",
  "documenting",
  "indexing",
  "done",
  "failed",
] as const;

export const githubImportJob = pgTable(
  "github_import_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repoFullName: text("repo_full_name").notNull(),
    status: text("status", { enum: githubImportJobStatuses }).default("queued").notNull(),
    message: text("message").notNull(),
    error: text("error"),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    projectName: text("project_name"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("github_import_job_user_id_idx").on(table.userId),
    index("github_import_job_status_idx").on(table.status),
    uniqueIndex("github_import_job_user_repo_partial_idx")
      .on(table.userId, table.repoFullName)
      .where(sql`status NOT IN ('done', 'failed')`),
  ],
);
