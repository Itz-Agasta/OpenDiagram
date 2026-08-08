import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  // Anything under noExternal drags its own deps into the bundle, and a bundled
  // module is never loaded by specifier, so Sentry's preload hook cannot wrap it.
  // That is why `pg` is a dependency of this app it never imports: tsdown
  // externalizes package.json deps, which is the only reason `db` spans exist.
  // https://github.com/getsentry/sentry-javascript/issues/14028
  noExternal: [/@OpenDiagram\/.*/],
});
