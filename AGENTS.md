# AGENTS.md

OpenDiagram - AI diagram generator for software architecture. Describe your system in plain English, get editable diagrams on an Excalidraw canvas.

Bun 1.3 monorepo. `apps/web` Next.js 16 (:3001), `apps/server` Hono (:3000), `apps/fumadocs` (:4000), `packages/{auth,config,db,env,harness}`. Setup (`.env.sample` into `apps/server/.env` and `apps/web/.env`) is in `CONTRIBUTING.md`.

## Commands

```bash
bun run dev:server       # API; run web and server as two separate processes
bun run dev:web          # web
just check               # oxlint + oxfmt --write
just check-ci            # what CI runs: oxlint --deny-warnings + oxfmt --check
just types               # tsgo (web + server; the harness is checked through its importers)
just test                # bun test in packages/harness
just knip                # unused files, exports and dependencies
just db-generate <name>  # migration from schema changes
just db-migrate          # apply pending migrations
just db-seed             # plan limits; a fresh DB needs migrate, then seed
```

Before pushing: `just check-ci`, `just types`, `just test`, `just knip`. CI runs these plus `bun run build` (`.github/workflows/codequality.yml`).

## Repo conventions

- **Next.js 16 is not the Next.js you know.** APIs, conventions and file structure changed. Read `node_modules/next/dist/docs/` before writing app-router or config code.
- Add deps with `bun add`, not by hand-editing package.json. Workspace deps are `workspace:*`; `catalog:` only for deps used by two or more packages.
- Web: shared components in `components/`, page-specific ones in `components/<feature>/`.
- **`apps/server` and `packages/*` files stay under 300-350 LOC, comments included.** Past that, split into a directory with a narrow entry point, like `lib/quota/` and `lib/dodo/`. Not enforced in `apps/web` (vendored shadcn skews it).
- Typed env: import from `@OpenDiagram/env/web` or `@OpenDiagram/env/server`.
- `packages/db`: never acquire nested DB connections.
- Interactive controls get `cursor: pointer` from the global stylesheet; override only for disabled/loading.
- Never guess a library API: read the installed version's docs or source.
- **Upstream bugs get reported** If a dependency is wrong, say so in the PR with the installed version and the `node_modules` file and line that proves it. A workaround still ships, but named as one, with a `FIXME(tag):` saying what unblocks its removal.

## Harness (packages/harness): read before touching diagram code

The diagram engine. Full docs: `packages/harness/README.md`.

- **The LLM never chooses pixels, colors or fonts.** It emits a semantic `DiagramSpec`; layout (ELK / sequence grid) and the themed renderer own all geometry and styling. Don't add visual fields to the spec.
- **Sizing and rendering must agree:** `measure.ts#nodeSize` reserves the box the renderer draws into. Change both together.
- **Route last, draw verbatim.** ELK only places; `src/router/` routes every edge and places every label against the final boxes, and the renderer draws those polylines exactly. Sequence diagrams are the exception (`layout/sequence.ts` builds its own grid and routes). Any pass that moves nodes runs before `routeGeometry`. Excalidraw `elbowed` arrows don't work via programmatic insert.
- **Judge layout by the render, not only the score.** The report has had blind spots (flow inversion, stair-steps, oversize ribbons). Real model output for replaying is produced by `apps/server/scripts/eval/`.
- **No `@excalidraw/excalidraw` imports inside the harness** (browser-only). Skeleton to element conversion lives in `apps/web/src/lib/excalidraw-utils.ts`, which must pass fresh elements through `restoreElements` (paint-skip bug otherwise).
- **`bun --hot` does not reload harness edits.** Restart `dev:server` or you are testing stale code.
- **The Zod spec schema stays Gemini-safe:** no `.refine()`, `.default()` or `.transform()`. Gemini typos `from1` for `from` in edges; `experimental_repairToolCall` in `apps/server/src/lib/agent/chat-stream.ts` fixes it, don't remove it.
- **elkjs 0.11.1 swaps axes on compound nodes in DOWN/UP layouts** with `INCLUDE_CHILDREN` (eclipse/elk#1033): `nodeSize.minimum` and `contentAlignment` apply to the other axis. `containerOptions` in `layout/elk-common.ts` swaps them back; any new per-container ELK option with an axis needs the same. `layered.wrapping.strategy: SINGLE_EDGE` throws inside elkjs; use `MULTI_EDGE`.
- Measured negative results, don't re-add: `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` (worse routing), `elk.layered.mergeEdges` (crossings). More for the view planner in `src/model/views.ts`.
- **After any harness change run `just test`.** Extend it when you add pipeline features, and check the new test fails without your fix.
- A script that imports the harness never exits on its own (the elkjs worker keeps it alive); end it with `process.exit(0)`.

## Server

- Sentry needs `--preload @sentry/node/preload` (dev script, start script, Dockerfile `CMD`). The Hono middleware inits after `pg` is imported, so without it every `db` span silently vanishes. Same reason `bun build --compile` can't be used.
- `tsdown` bundles `@OpenDiagram/*` but keeps package.json deps external, so `apps/server` lists deps it never imports itself (`pg`, `better-auth`, `elkjs`, `dotenv`). Don't remove them.
- Every request writes a wide event to `apps/server/.evlog/logs/`. It carries what no UI shows, e.g. `chat.targetedIds` (an id matching no frame means the model garbled it), `chat.messageCount`, `chat.cacheReadTokens`. Request order is an assertion too: resuming a thread is `PATCH /threads/:id`, then `GET /threads/:id/messages`; a `threads/active` read there means the by-id fetch regressed.
