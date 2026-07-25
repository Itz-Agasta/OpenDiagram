# Contributing to OpenDiagram

Thanks for helping build an open-source AI diagram generator. Bug fixes, themes, icon packs, layout improvements and docs are all welcome.

## Getting set up

**Prerequisites:** [Bun](https://bun.sh) 1.3+ and a PostgreSQL database.

```bash
git clone https://github.com/Itz-Agasta/OpenDiagram.git
cd OpenDiagram
just reinstall

cp .env.sample apps/server/.env
cp .env.sample apps/web/.env    # then fill in values in both
bun run dev
```

Web runs on `:3001`, API on `:3000`, docs on `:4000`. Run `just --list` to see every recipe.

## Before you open a PR

```bash
just check     # oxlint + oxfmt --write
just types     # typecheck all packages with tsgo
```

Both must pass. If you touched `packages/harness`, also run:

```bash
cd packages/harness && bun test
```

## Project layout

```
apps/
  web/          Next.js 16 frontend (Excalidraw canvas + agent panel)
  server/       Hono API (agent loop, layout, rendering)
  fumadocs/     Documentation site
packages/
  harness/      The diagram engine: schema, ELK layout, renderer, themes
  db/           PostgreSQL schema (Drizzle)
  auth/         Better Auth config
  env/          Typed environment validation
```

## Working on the diagram engine

`packages/harness` is where layout and rendering live. Read [`packages/harness/README.md`](./packages/harness/README.md) first. A few rules that are easy to trip over:

- **The LLM never chooses pixels, colors or fonts.** It emits a semantic `DiagramSpec`; layout and the themed renderer own all geometry and styling. Don't add visual fields to the spec.
- **Sizing and rendering must agree.** `measure.ts#nodeSize` reserves the box the renderer draws into. Change both together.
- **Edge routes are drawn verbatim.** Labels are measured against ELK's exact polyline. Never reroute after layout.
- **No `@excalidraw/excalidraw` imports inside the harness** - it is browser-only. Skeleton-to-element conversion lives in `apps/web/src/lib/excalidraw-utils.ts`.
- **`bun --hot` does not reload harness edits.** Restart `dev:server` or you will be verifying stale code.
- **Always run `bun test` in `packages/harness` after a change**, and extend the suite when you add pipeline features.

## Code style

- Use the `@/` path alias for `apps/web/src/`.
- Shared dependencies use the `catalog:` protocol in the root `package.json`. Don't hardcode versions in apps.
- Always install with `bun add`. Never hand-edit `package.json`.
- Workspace dependencies use `workspace:*`.
- oxlint enforces style. Follow the patterns in adjacent files.
- Keep changes surgical. Don't refactor code unrelated to your PR.

## Commit messages

Conventional Commits, lowercase scope:

```
feat(harness): add crow-foot notation for ERD relationships
fix(web): restore elements through restoreElements before insert
docs(readme): clarify self-hosting prerequisites
```

## Reporting bugs

Open an issue with the bug report template. For diagram output problems, include the prompt you used and a screenshot or `.excalidraw` export - it makes layout bugs far faster to reproduce.

## Getting help

Stuck on setup or using the app? Open a [discussion](https://github.com/Itz-Agasta/OpenDiagram/discussions) or email **support@opendiagram.ink**. For anything else aimed at the maintainers, use **admin@opendiagram.ink**.

## Security

Do not open a public issue for security problems. See [SECURITY.md](./SECURITY.md).
