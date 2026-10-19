/**
 * Server bundle for the Docker image: `bun scripts/build.ts` -> dist/index.js.
 *
 * Sentry 11 has no runtime hook on Bun. sentryBunPlugin rewrites libraries as they
 * are bundled so they publish on diagnostics channels, which is the only way `pg`
 * queries become `db` spans. That is why `pg` is bundled while the other
 * package.json deps stay external, and why the dev server (unbundled) has none.
 * https://docs.sentry.io/platforms/javascript/guides/bun.md
 */
import { sentryBunPlugin } from "@sentry/bun/plugin";

const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();

const external = [
  ...Object.keys(pkg.dependencies).filter((d) => d !== "pg" && !d.startsWith("@OpenDiagram/")),
  // The plugin's injected code imports these; one copy from node_modules, shared
  // with @sentry/hono, instead of a second bundled one.
  "@sentry/*",
  "@opentelemetry/api",
];

const result = await Bun.build({
  entrypoints: [new URL("../src/index.ts", import.meta.url).pathname],
  outdir: new URL("../dist", import.meta.url).pathname,
  target: "bun",
  format: "esm",
  external,
  plugins: [sentryBunPlugin()],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
for (const out of result.outputs) console.log(`${out.path} ${(out.size / 1e6).toFixed(2)} MB`);
