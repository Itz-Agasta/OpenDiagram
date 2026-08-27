# AGENTS.md

OpenDiagram - AI diagram generator for software architecture. Describe your system in plain English, get editable diagrams on an Excalidraw canvas.

Bun 1.3 monorepo. `apps/web` Next.js 16 (:3001), `apps/server` Hono (:3000), `apps/fumadocs` (:4000), `packages/{auth,config,db,env,harness}`.

## Commands

```bash
bun run dev:web        # one process each, both backgrounded, started separately:
bun run dev:server     # the turbo TUI (`bun run dev`) segfaults on this machine
just check             # oxlint + oxfmt --write
just types             # tsgo across the workspace
just db-generate <name>  # migration from schema changes
just db-migrate          # apply pending migrations
just db-seed             # plan limits from packages/db/src/seed.ts (--dry-run to preview)
just db-setup            # migrate + seed, in that order; a fresh DB needs both
just clean | just reinstall
```

Run `just check` and `just types` before calling a coding session done.

## Repo conventions

- **Next.js 16 is not the Next.js you know.** Breaking changes to APIs, conventions, and file structure. Read `node_modules/next/dist/docs/` before writing app-router or config code, and heed deprecation notices.
- Install with `bun add`, never by hand-editing package.json. Workspace deps are `workspace:*`. `catalog:` is only for deps used by **two or more** packages.
- `@/` aliases `apps/web/src/`. Shared components live in `components/`, page-specific ones in `components/<feature>/`.
- **`apps/server` and `packages/*` files stay under 300 LOC, comments included.** Past that, split. Give the pieces a real structure - a directory with a narrow entry point, the way `lib/quota/` and `lib/dodo/` already do - rather than cutting wherever line 300 lands. Does not apply to `apps/web`, where vendored shadcn components skew the count.
- Typed env: import from `@OpenDiagram/env/web` or `@OpenDiagram/env/server`.
- `packages/db`: never acquire nested DB connections.
- Interactive controls must look interactive: `cursor: pointer` from the global stylesheet. Only override for disabled/loading (`cursor-wait`, `cursor-not-allowed`).
- No em dashes and no `--`. Prose, comments, commit messages.
- Never guess an API. context7 MCP for known libraries, Exa for obscure packages / platform APIs / specific URLs, ask the user if neither settles it.

## Harness (packages/harness) - read before touching diagram code

The diagram engine. Full docs: `packages/harness/README.md`. Non-negotiables:

- **LLM never chooses pixels/colors/fonts.** It emits a semantic `DiagramSpec`; layout (ELK / sequence grid) + themed renderer own all geometry and styling. Don't add visual fields to the spec.
- **Sizing and rendering must agree:** `measure.ts#nodeSize` reserves the box the renderer draws into. Change both branches together.
- **Edge routes are drawn verbatim.** Labels are measured against ELK's exact polyline; never reroute after layout. Excalidraw `elbowed` arrows don't work via programmatic insert.
- **No `@excalidraw/excalidraw` imports inside the harness** (browser-only package). Skeleton to element conversion lives in `apps/web/src/lib/excalidraw-utils.ts`, which must pass fresh elements through `restoreElements` (paint-skip bug otherwise).
- **`bun --hot` does NOT reload harness edits.** Restart `dev:server` or you verify stale code.
- **Zod spec schema stays Gemini-safe:** no `.refine()/.default()/.transform()`. Gemini reliably typos `from1` for `from` in edges. `experimental_repairToolCall` in `routes/diagram.ts` fixes it deterministically; don't remove it.
- Measured negative result: `elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX` makes routing worse. Don't re-add. See `future.md` for the roadmap.
- **After ANY harness change run `bun test` in `packages/harness`** (`test/harness.test.ts` - geometry smoke suite: sequence fragments, ERD crow-feet, orthogonal routes, column alignment). Extend it when you add pipeline features.

## Verifying a change against the running app

**`apps/server/.env` `DATABASE_URL` points at PRODUCTION.** Test fixtures are real rows. Clean them up, and never run destructive SQL without saying so first. (Temporary: the prod DB and its env get wiped before launch.)

`next-server` exiting **143 is earlyoom**, not your bug.

Server Sentry needs `--preload @sentry/node/preload` (dev script, start script, Dockerfile `CMD`). The Hono middleware inits after `pg` is already imported, so without the flag every `db` span silently vanishes. Same reason `bun build --compile` cannot be used.

Load **`/analyze-logs`** whenever you touch a route, the agent loop, or anything you then exercise in a browser. The `.evlog/logs/` wide events carry context no UI shows: `chat.targetedIds` (an id matching no known frame means the model garbled it), `chat.canvasDiagrams`, `chat.messageCount`, `chat.cacheReadTokens`. Route _order_ is an assertion too: resuming a thread must read `GET /threads` -> `PATCH /threads/:id` -> `GET /threads/:id/messages`, and a `threads/active` re-read means the by-id fetch regressed.

Two browser drivers, not interchangeable: **Chrome DevTools MCP proves, browser-use drives.** DevTools MCP for request bodies, payload sizes, console errors, and `take_snapshot` (it surfaces `disabled`, which screenshots don't). browser-use for multi-step flows and scripted fixtures.

- **Radix menus ignore `element.click()`.** Read the bounding box, then `click_at_xy`.
- **browser-use `js()` can time out on a `fetch` that actually succeeded.** The CDP reply timed out, not the HTTP call. Confirm via DB/evlog before calling it a failure.
- They drive **separate Chrome instances** and neither lists the other's tabs, so log in twice or hand off by URL. Fixable: the plugin ships as bare `chrome-devtools-mcp@<version>`, and `--autoConnect` (Chrome 144+) points it at the same `chrome://inspect` browser browser-use uses.

## Comments

Bar: a comment carries what the code cannot, at a different level of detail. Same level as the code = delete it. Docstrings on exported API only.

- Inline 1-3 lines, exported fn/module header 6. Dont make longer design note unless its important.
- Write: why this and not the obvious alternative (name it); "we deliberately do NOT X, because Y"; landmines (required call order, cache windows, upstream bugs being worked around); preconditions and side effects on exported API; measured numbers ("2 statements -> 1", never "faster").
- Don't write: restatements, stack tutorials, banners inside a function, changelogs/dates/author tags, commented-out code, "Note that" / "Basically" / "Obviously". A long comment propping up confusing code means fix the code.
- **A review finding is not a comment prompt.** Fixed it? The fix is the answer, say nothing. Declined it? That is a reply in chat, not a block above the line. Only the durable half earns ink: the landmine that made it a real risk, or the cheaper approach that is wrong and will be proposed again. Left unchecked this compounds - each review round adds a paragraph, and one call ends up under three blocks restating each other. Tell: the same fact written twice inside one function.
- **Route handlers:** every route gets an interface comment; a bare `.get(...)` leaves its contract undefined. Write what a caller needs that the route string and the Zod schema beside it don't already carry: who calls this and what for, in the caller's own words (`/** The history dropdown. Metadata only, no message bodies, no 'spec'. */`), then any contract they could get wrong - a status code that isn't self-evident, an ordering or idempotency guarantee, "the only writer of table X". Never restate method, path, params, or response shape; those already have copies that stay honest, and prose would be one more that nothing checks. Per line, ask whether someone could have written it from the code beside it, and cut it if so. `routes/projects/threads.ts` is the pattern. The 6-line header cap still applies: past it, it is a README section.
- Cite sources; our Exa/context7 research is gone next session. Bare URL, own line, last, pinned to an anchor/tag/SHA (`main` links rot). One link, not three. Link upstream gotchas, the spec behind a literal, platform limits (Cloud Run throttling, Supavisor ceilings). Don't link routine React/Hono/Tailwind/shadcn usage.

```ts
// Lax, not `none`: `none` let any site's no-preflight POST ride the session cookie.
// Our web and API are same-site, so our own cross-origin fetches still work.
// https://better-auth.com/docs/integrations/hono
sameSite: "lax",
```

## Session

- **`/caveman`** at the start of every conversation, to compress output.
- **Ask before building.** Planning anything non-trivial, put the fork to the user with `AskUserQuestion` and a recommendation instead of guessing. The usual bias is to make the call silently and keep moving; invert it here. This repo has a vision in one person's head, and being interviewed about it costs less than reviewing the wrong build.
- **`/ponytail`** whenever you review code, including your own. A reviewer asked to find gaps will find them, and the result is over-engineering: extra layers, defensive branches, tests for cases that can't happen. Ponytail biases the pass toward deleting rather than adding.
