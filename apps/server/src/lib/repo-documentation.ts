import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const MAX_FILE_BYTES = 128 * 1024;
const MAX_FILES = 48;
const MAX_FILE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 60_000;

const EXCLUDED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const EXCLUDED_FILE_NAMES = new Set([
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const INCLUDED_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".go",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".py",
  ".rs",
  ".sql",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

export type RepositoryDocProvenance = {
  kind: "repo_documentation";
  generated: true;
  generatorVersion: "repo-doc-stub-v1";
  repoFullName: string;
  branch: string;
  commitSha: string | null;
  importedAt: string;
  sourcePaths: string[];
  userEditedAt: string | null;
};

export type RepositoryDocumentationResult = {
  markdown: string;
  provenance: RepositoryDocProvenance;
  repoPath: string;
  commitSha: string | null;
  sourceDocuments: RepositorySourceDocument[];
};

export type RepositorySourceDocument = {
  name: string;
  path: string;
  content: string;
  bytes: number;
};

type SourceFile = {
  path: string;
  content: string;
  bytes: number;
};

export async function cloneAndBuildRepositoryDoc(input: {
  repoFullName: string;
  defaultBranch: string;
  token: string;
  importedAt: string;
}): Promise<RepositoryDocumentationResult> {
  const repoPath = await cloneRepository(input);
  const commitSha = await getCommitSha(repoPath);
  const sourceFiles = await collectSourceFiles(repoPath);
  const markdown = buildStubDocumentation({
    repoFullName: input.repoFullName,
    defaultBranch: input.defaultBranch,
    commitSha,
    sourceFiles,
  });

  return {
    markdown,
    provenance: {
      kind: "repo_documentation",
      generated: true,
      generatorVersion: "repo-doc-stub-v1",
      repoFullName: input.repoFullName,
      branch: input.defaultBranch,
      commitSha,
      importedAt: input.importedAt,
      sourcePaths: sourceFiles.map((file) => file.path),
      userEditedAt: null,
    },
    repoPath,
    commitSha,
    sourceDocuments: sourceFiles.map((file) => ({
      name: safeFileName(`${file.path}.md`),
      path: file.path,
      bytes: file.bytes,
      content: [
        `# ${file.path}`,
        "",
        `Repository: ${input.repoFullName}`,
        `Branch: ${input.defaultBranch}`,
        commitSha ? `Commit: ${commitSha}` : "Commit: unknown",
        "",
        "```text",
        file.content,
        "```",
      ].join("\n"),
    })),
  };
}

async function cloneRepository(input: {
  repoFullName: string;
  defaultBranch: string;
  token: string;
  importedAt: string;
}) {
  // Default under the OS temp dir: Cloud Run's container filesystem is
  // read-only except for /tmp, so writing under cwd fails there.
  const baseDir = process.env.OPENDIAGRAM_REPO_CACHE_DIR
    ? path.resolve(process.env.OPENDIAGRAM_REPO_CACHE_DIR)
    : path.join(tmpdir(), "opendiagram-repos");
  await mkdir(baseDir, { recursive: true });

  const repoDir = path.join(
    baseDir,
    `${safePathSegment(input.repoFullName)}-${Date.parse(input.importedAt)}-${randomUUID().slice(0, 8)}`,
  );
  const askPassDir = await mkdtemp(path.join(tmpdir(), "opendiagram-git-askpass-"));
  const askPassPath = path.join(askPassDir, "askpass.sh");

  try {
    await writeFile(
      askPassPath,
      [
        "#!/bin/sh",
        'case "$1" in',
        '  *Username*) printf "%s\\n" "x-access-token" ;;',
        '  *) printf "%s\\n" "$OPENDIAGRAM_GITHUB_TOKEN" ;;',
        "esac",
        "",
      ].join("\n"),
      { mode: 0o700 },
    );

    const cloneUrl = `https://github.com/${input.repoFullName}.git`;
    const proc = Bun.spawn(
      ["git", "clone", "--depth", "1", "--branch", input.defaultBranch, cloneUrl, repoDir],
      {
        env: {
          ...process.env,
          GIT_ASKPASS: askPassPath,
          GIT_TERMINAL_PROMPT: "0",
          OPENDIAGRAM_GITHUB_TOKEN: input.token,
        },
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    const [exitCode, stderr] = await Promise.all([proc.exited, streamToText(proc.stderr)]);

    if (exitCode !== 0) {
      throw new Error(`Could not clone repository: ${sanitizeGitError(stderr)}`);
    }
  } finally {
    await rm(askPassDir, { recursive: true, force: true });
  }

  return repoDir;
}

export async function cleanupRepositoryClone(repoPath: string) {
  await rm(repoPath, { recursive: true, force: true });
}

async function getCommitSha(repoPath: string) {
  const proc = Bun.spawn(["git", "-C", repoPath, "rev-parse", "HEAD"], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout] = await Promise.all([proc.exited, streamToText(proc.stdout)]);

  return exitCode === 0 ? stdout.trim() || null : null;
}

async function collectSourceFiles(repoPath: string) {
  const files: SourceFile[] = [];
  let totalChars = 0;
  const candidates: string[] = [];

  for await (const candidate of walkRepo(repoPath, repoPath)) {
    candidates.push(candidate);
  }

  for (const relativePath of rankPaths(candidates)) {
    if (files.length >= MAX_FILES || totalChars >= MAX_TOTAL_CHARS) break;

    const absolutePath = path.join(repoPath, relativePath);
    const info = await stat(absolutePath).catch(() => null);
    if (!info?.isFile() || info.size > MAX_FILE_BYTES) continue;

    const content = await readFile(absolutePath, "utf8").catch(() => null);
    if (!content || content.includes("\0")) continue;

    const truncated = truncate(content, Math.min(MAX_FILE_CHARS, MAX_TOTAL_CHARS - totalChars));
    totalChars += truncated.length;
    files.push({ path: relativePath, content: truncated, bytes: info.size });
  }

  return files;
}

async function* walkRepo(root: string, current: string): AsyncGenerator<string> {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);

  // Sort entries: files first, then directories to yield root/important files early
  entries.sort((a, b) => {
    if (a.isFile() && b.isDirectory()) return -1;
    if (a.isDirectory() && b.isFile()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    if (entry.isFile() && shouldSkipFile(entry.name)) continue;

    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      yield* walkRepo(root, absolutePath);
    } else if (entry.isFile()) {
      const relativePath = path.relative(root, absolutePath);
      if (shouldIncludeFile(relativePath)) {
        yield relativePath;
      }
    }
  }
}

function shouldSkipFile(fileName: string) {
  return EXCLUDED_FILE_NAMES.has(fileName) || fileName.endsWith(".map");
}

function shouldIncludeFile(relativePath: string) {
  const fileName = path.basename(relativePath);
  if (/^readme(\..*)?$/i.test(fileName)) return true;
  if (
    ["package.json", "tsconfig.json", "turbo.json", "justfile"].includes(fileName.toLowerCase())
  ) {
    return true;
  }

  const extension = path.extname(fileName).toLowerCase();
  return INCLUDED_EXTENSIONS.has(extension);
}

function rankPaths(paths: string[]) {
  return [...paths].sort((a, b) => scorePath(b) - scorePath(a) || a.localeCompare(b));
}

function scorePath(relativePath: string) {
  const normalized = relativePath.toLowerCase();
  let score = 0;
  if (normalized.includes("readme")) score += 100;
  if (normalized === "package.json") score += 90;
  if (normalized.startsWith("docs/")) score += 70;
  if (normalized.startsWith("src/")) score += 50;
  if (normalized.includes("route") || normalized.includes("api")) score += 20;
  if (normalized.includes("test") || normalized.includes("spec")) score -= 30;
  return score;
}

function buildStubDocumentation(input: {
  repoFullName: string;
  defaultBranch: string;
  commitSha: string | null;
  sourceFiles: SourceFile[];
}) {
  const fingerprint = createHash("sha256")
    .update(input.sourceFiles.map((file) => `${file.path}:${file.bytes}`).join("\n"))
    .digest("hex")
    .slice(0, 12);

  return [
    `# ${input.repoFullName}`,
    "",
    "Generated repository documentation scaffold.",
    "",
    "## Repository snapshot",
    `- Branch: \`${input.defaultBranch}\``,
    `- Commit: ${input.commitSha ? `\`${input.commitSha}\`` : "unknown"}`,
    `- Sampled files: ${input.sourceFiles.length}`,
    `- Snapshot fingerprint: \`${fingerprint}\``,
    "",
    "## Source files sampled",
    ...input.sourceFiles.map((file) => `- \`${file.path}\` (${file.bytes} bytes)`),
    "",
    "## Raw source excerpts",
    ...input.sourceFiles.flatMap((file) => [
      "",
      `### ${file.path}`,
      "```text",
      file.content,
      "```",
    ]),
  ].join("\n");
}

function safePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 120);
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 180);
}

function truncate(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n[truncated]` : value;
}

function sanitizeGitError(value: string) {
  return value.replace(/https:\/\/x-access-token:[^@]+@/g, "https://x-access-token:***@").trim();
}

async function streamToText(stream: ReadableStream<Uint8Array> | null) {
  return stream ? new Response(stream).text() : "";
}
