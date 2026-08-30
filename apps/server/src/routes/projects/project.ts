import { and, db, desc, eq } from "@OpenDiagram/db";
import { project, projectFile } from "@OpenDiagram/db/schema/projects";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthVariables } from "../../lib/require-auth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  source: z.enum(["manual", "github_import"]).optional(),
  sourceMetadata: z.unknown().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

const projectListColumns = {
  id: project.id,
  name: project.name,
  description: project.description,
  source: project.source,
  sourceMetadata: project.sourceMetadata,
  generationStatus: project.generationStatus,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
};

export const projectRoute = new Hono<{ Variables: AuthVariables }>();

projectRoute.get("/", async (c) => {
  const userId = c.get("userId");

  // `?include=files` exists to kill an N+1: the dashboard used to fetch the
  // project list and then one file list per project, so ten projects meant
  // eleven requests, each paying its own auth and network cost. One left join
  // answers the whole tree instead. Left, not inner, so a project with no files
  // still appears -- that is the state right after creation, and an inner join
  // would hide the project the user just made.
  if (c.req.query("include") === "files") {
    const rows = await db
      .select({
        project: projectListColumns,
        file: {
          id: projectFile.id,
          projectId: projectFile.projectId,
          type: projectFile.type,
          name: projectFile.name,
          createdAt: projectFile.createdAt,
          updatedAt: projectFile.updatedAt,
        },
      })
      .from(project)
      .leftJoin(projectFile, eq(projectFile.projectId, project.id))
      .where(eq(project.userId, userId))
      .orderBy(desc(project.updatedAt), desc(projectFile.updatedAt));

    // The join repeats each project once per file, so fold it back. A Map keeps
    // insertion order, and the rows already arrive newest-project-first, so the
    // grouped output needs no second sort.
    type ListedProject = (typeof rows)[number]["project"] & {
      files: NonNullable<(typeof rows)[number]["file"]>[];
    };
    const byId = new Map<string, ListedProject>();
    for (const row of rows) {
      let entry = byId.get(row.project.id);
      if (!entry) {
        entry = { ...row.project, files: [] };
        byId.set(row.project.id, entry);
      }
      if (row.file) entry.files.push(row.file);
    }

    return c.json({ projects: [...byId.values()] });
  }

  const rows = await db
    .select(projectListColumns)
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(desc(project.updatedAt));

  return c.json({ projects: rows });
});

projectRoute.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const [row] = await db
    .insert(project)
    .values({ ...parsed.data, userId })
    .returning();

  if (!row) {
    return c.json({ error: "Could not create project" }, 500);
  }

  return c.json({ project: row }, 201);
});

projectRoute.get("/:id", async (c) => {
  const userId = c.get("userId");
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId)));

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ project: row });
});

projectRoute.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400);
  }

  const [row] = await db
    .update(project)
    .set(parsed.data)
    .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId)))
    .returning();

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ project: row });
});

/**
 * The dashboard tree's delete action. Files and their content rows go with the
 * project via the cascade on project_id, so this is the whole cleanup.
 *
 * 404 covers "not yours" as well as "gone", deliberately: a distinct 403 would
 * confirm that some other account owns that id.
 */
projectRoute.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const [row] = await db
    .delete(project)
    .where(and(eq(project.id, c.req.param("id")), eq(project.userId, userId)))
    .returning({ id: project.id });

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ ok: true });
});
