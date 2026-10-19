/**
 * Submits every registry package resolved in bun.lock to GitHub's dependency graph.
 *
 * GitHub's static graph does not parse bun.lock: it reads package.json as npm, so
 * `catalog:` deps show the literal "catalog:", ranges never match an advisory and
 * transitive deps are missing. Submitted snapshots take precedence over that parse,
 * which is what gives us Dependabot alerts. Runs from .github/workflows/dependency-graph.yml.
 */
import lock from "../../bun.lock" with { type: "jsonc" };

type Entry = [spec: string, registry?: unknown, ...rest: unknown[]];

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

// A workspace's dep resolves to the hoisted key ("zod") or, when its version differs
// from the hoisted one, to a key under the workspace's name ("web/zod").
const directKeys = new Set(
  Object.values(lock.workspaces as Record<string, Record<string, unknown>>).flatMap((ws) =>
    ["dependencies", "devDependencies", "optionalDependencies"].flatMap((field) =>
      Object.keys((ws[field] as Record<string, string> | undefined) ?? {}).flatMap((dep) => [
        dep,
        `${ws.name}/${dep}`,
      ]),
    ),
  ),
);

const resolved: Record<string, { package_url: string; relationship: "direct" | "indirect" }> = {};
for (const [key, entry] of Object.entries(lock.packages as Record<string, Entry>)) {
  // Registry entries are ["name@version", registry, info, integrity]. Workspace, git,
  // link and file entries carry an object or nothing at index 1 and have no advisories.
  if (typeof entry[1] !== "string") continue;
  const at = entry[0].lastIndexOf("@");
  const name = entry[0].slice(0, at);
  const version = entry[0].slice(at + 1);
  const purl = `pkg:npm/${name.replace(/^@/, "%40")}@${version}`;
  if (resolved[purl]?.relationship === "direct") continue;
  resolved[purl] = {
    package_url: purl,
    relationship: directKeys.has(key) ? "direct" : "indirect",
  };
}

const repo = env("GITHUB_REPOSITORY");
const res = await fetch(`https://api.github.com/repos/${repo}/dependency-graph/snapshots`, {
  method: "POST",
  headers: {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env("GITHUB_TOKEN")}`,
  },
  body: JSON.stringify({
    version: 0,
    sha: env("GITHUB_SHA"),
    ref: env("GITHUB_REF"),
    job: { correlator: `${env("GITHUB_WORKFLOW")}_bun-lock`, id: env("GITHUB_RUN_ID") },
    detector: {
      name: "opendiagram-bun-lock",
      version: "1.0.0",
      url: `https://github.com/${repo}/blob/main/.github/scripts/submit-bun-deps.ts`,
    },
    scanned: new Date().toISOString(),
    manifests: {
      "bun.lock": { name: "bun.lock", file: { source_location: "bun.lock" }, resolved },
    },
  }),
});
console.log(res.status, await res.text(), `${Object.keys(resolved).length} packages`);
if (!res.ok) process.exit(1);
