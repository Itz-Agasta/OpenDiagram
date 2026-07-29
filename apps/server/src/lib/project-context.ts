import { and, db, desc, eq, sql } from "@OpenDiagram/db";
import { project, projectFile, projectFileContent } from "@OpenDiagram/db/schema/projects";
import { projectFileContentJoin } from "./project-file-content";

/**
 * Grounding context for project-scoped AI answers, read straight from the
 * project's own rows.
 *
 * This used to go through Cognee, a hosted knowledge-graph service, with a local
 * builder behind it as the fallback. The graph never paid for its latency here:
 * every answer still had to be grounded in the files themselves, the index had
 * to be re-marked stale on every single file write, and the round trip sat
 * directly in front of the user's reply. Reading the project's own files is
 * faster and no less grounded for a single-project chat, so what was the
 * fallback is now the whole implementation.
 *
 * If a knowledge graph is ever wanted again, it belongs behind this same
 * function signature rather than threaded through the write path.
 *
 * The read is bounded, which it was not: it used to select every file's scene,
 * spec, content and history with no limit and then throw almost all of it away
 * at MAX_CONTEXT_CHARS, so a project with fifty large diagrams moved megabytes
 * to build 16 kB of prompt.
 *
 * TODO: decide how much a chat answer should actually see. The bound below
 * fixes the unbounded read but not the design question, and the two open
 * options are "the active file only" (one small read, no cross-file answers)
 * and "the whole project, capped", which is what this now is.
 *
 * Note the two callers differ. `POST /api/projects/:projectId/chat` is the one
 * under review; `lib/repo-generation.ts` wants the whole project regardless, so
 * narrowing the chat path must not narrow that one with it. The canvas agent
 * (`routes/diagram.ts`) does not come here at all -- it gets `currentSpec` from
 * the client.
 */

const MAX_DOCUMENT_CHARS = 16_000;
const MAX_CONTEXT_CHARS = 16_000;

/**
 * Files read for grounding, newest first. The whole context is capped at
 * MAX_CONTEXT_CHARS anyway, so files past this point could never reach the
 * prompt -- they were pure transfer.
 */
const MAX_CONTEXT_FILES = 12;

export type ProjectContextSource = {
  id: string;
  title: string;
  sourceType: string;
  excerpt: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type ProjectContext = {
  context: string;
  sources: ProjectContextSource[];
  provider: "local";
};

/** Null when the project does not exist or does not belong to this user. */
export async function getProjectContext(
  projectId: string,
  userId: string,
): Promise<ProjectContext | null> {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)));

  if (!row) return null;

  // Truncated in SQL so a 2MB scene does not cross the wire to be cut to 16kB
  // here. `history` is not selected at all: nothing below reads it.
  //
  // Left-joined, so a file missing its content row still contributes its name
  // and type rather than dropping out of the context.
  const files = await db
    .select({
      id: projectFile.id,
      name: projectFile.name,
      type: projectFile.type,
      scene: sql<string | null>`left(${projectFileContent.scene}::text, ${MAX_DOCUMENT_CHARS})`,
      spec: sql<string | null>`left(${projectFileContent.spec}::text, ${MAX_DOCUMENT_CHARS})`,
      content: sql<string | null>`left(${projectFileContent.content}::text, ${MAX_DOCUMENT_CHARS})`,
    })
    .from(projectFile)
    .leftJoin(projectFileContent, projectFileContentJoin)
    .where(eq(projectFile.projectId, projectId))
    .orderBy(desc(projectFile.updatedAt))
    .limit(MAX_CONTEXT_FILES);

  const sources: ProjectContextSource[] = [
    {
      id: row.id,
      title: `Project: ${row.name}`,
      sourceType: "project",
      excerpt: row.description ?? "Project overview",
      score: 1,
      metadata: { projectId },
    },
    ...files.map((file) => ({
      id: file.id,
      title: file.name,
      sourceType: file.type,
      excerpt: summarizeFile(file),
      score: 1,
      metadata: { projectId, fileId: file.id },
    })),
  ];

  return {
    context: truncate(
      [projectToMarkdown(row), ...files.map(fileToMarkdown)].join("\n\n"),
      MAX_CONTEXT_CHARS,
    ),
    sources,
    provider: "local",
  };
}

function projectToMarkdown(row: typeof project.$inferSelect) {
  return [`# Project: ${row.name}`, row.description ? `Description: ${row.description}` : null]
    .filter(Boolean)
    .join("\n\n");
}

/** What the query above returns: the large columns already text, already cut. */
type ContextFile = {
  id: string;
  name: string;
  type: string;
  scene: string | null;
  spec: string | null;
  content: string | null;
};

function fileToMarkdown(file: ContextFile) {
  return [
    `# File: ${file.name}`,
    `Type: ${file.type}`,
    file.spec ? `## Spec\n${unknownToText(file.spec)}` : null,
    file.scene ? `## Scene\n${unknownToText(file.scene)}` : null,
    file.content ? `## Content\n${unknownToText(file.content)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function summarizeFile(file: ContextFile) {
  return truncate(
    [file.spec, file.scene, file.content]
      .filter((value) => value != null)
      .map(unknownToText)
      .join("\n\n") || `${file.type} file`,
    MAX_CONTEXT_CHARS,
  );
}

function unknownToText(value: unknown) {
  if (typeof value === "string") return truncate(value, MAX_DOCUMENT_CHARS);

  try {
    return truncate(JSON.stringify(value, null, 2), MAX_DOCUMENT_CHARS);
  } catch {
    return "[Unserializable project data]";
  }
}

function truncate(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n[truncated]` : value;
}
