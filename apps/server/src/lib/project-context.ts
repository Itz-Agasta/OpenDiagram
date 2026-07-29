import { and, db, desc, eq } from "@OpenDiagram/db";
import { project, projectFile, projectFileContent } from "@OpenDiagram/db/schema/projects";
import {
  projectFileContentJoin,
  selectProjectFileColumns,
  type ProjectFileWithContent,
} from "./project-file-content";

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
 * TODO: decide how much a chat answer should actually see. Undecided on
 * purpose -- the two open options are "the active file only" (which makes this
 * a single small read and drops cross-file answers) and "the whole project,
 * capped". Either way the file read below wants a LIMIT and SQL-side
 * truncation before it is left alone: it selects every file's scene, spec,
 * content and history with no bound, then throws almost all of it away at
 * MAX_CONTEXT_CHARS -- megabytes over the wire to build 16 kB of prompt.
 *
 * Note the two callers differ. `POST /api/projects/:projectId/chat` is the one
 * under review; `lib/repo-generation.ts` wants the whole project regardless, so
 * narrowing the chat path must not narrow that one with it. The canvas agent
 * (`routes/diagram.ts`) does not come here at all -- it gets `currentSpec` from
 * the client.
 */

const MAX_DOCUMENT_CHARS = 16_000;
const MAX_CONTEXT_CHARS = 16_000;

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

  // Grounding needs the large columns, so this is one of the few reads that
  // joins `project_file_content`. Left-joined, so a file missing its content row
  // still contributes its name and type rather than dropping out of the context.
  const files = await db
    .select(selectProjectFileColumns())
    .from(projectFile)
    .leftJoin(projectFileContent, projectFileContentJoin)
    .where(eq(projectFile.projectId, projectId))
    .orderBy(desc(projectFile.updatedAt));

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

function fileToMarkdown(file: ProjectFileWithContent) {
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

function summarizeFile(file: ProjectFileWithContent) {
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
