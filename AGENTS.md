# AGENTS.md

## Project

OpenDiagram — open-source AI workspace for software architecture. Design systems with natural language, generate diagrams, document decisions, iterate with AI.

## Next.js 16 Warning

This is NOT the Next.js you know. Next.js 16 has breaking changes — APIs, conventions, and file structure may differ from older versions. Read guides in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

## Tech Stack

- **Runtime/PM:** Bun 1.3
- **Frontend:** Next.js 16 + React 19 + TypeScript
- **Backend:** Hono (Bun)
- **Database:** PostgreSQL (supabase) (via packages/db)
- **Auth:** Better Auth
- **AI:** Provider agnostic (OpenRouter, Anthropic, OpenAI, etc.)
- **Type checking:** tsgo (Go-native TS compiler, `@typescript/native-preview`)
- **Linting:** oxlint + oxfmt
- **Task runner:** Turbo (orchestration) + Just (dev shortcuts)

## Workspace Structure

```
apps/
  web/          # Next.js 16 frontend (port 3001)
  server/       # Hono API server (port 3000, bun --hot)
  fumadocs/     # Documentation site (port 4000)
packages/
  auth/         # Better Auth config
  config/       # Shared config
  db/           # Database schema + migrations
  env/          # Environment variable validation
  harness/      # Diagram engine: schema, layout, renderer
```

## Commands

```bash
# Dev
bun run dev            # All services via turbo
bun run dev:web        # Web only
bun run dev:server     # Server only

# Build
bun run build          # All packages via turbo

# Type check (tsgo)
bun run check-types    # All packages via turbo
just types             # Same, via justfile

# Lint + format
just check             # oxlint + oxfmt --write

# Cleanup
just clean             # Nuke node_modules, .turbo, .next, dist
just reinstall         # clean + bun install
```

## Code Style

- Use `@/` path alias for `apps/web/src/`.
- Shared deps use `catalog:` protocol in root package.json — don't hardcode versions in apps.
- Always install packages with `bun add` — never manually add to package.json.
- Workspace deps use `workspace:*`.
- Follow existing patterns in adjacent files.
- oxlint enforces style — don't duplicate lint rules in instructions.
- Organize components by scope:
  - `components/` — shared, reusable (button, card, input, etc.)
  - `components/<feature>/` — page-specific (e.g., `components/dashboard/`, `components/auth/`)

## Architecture

- `apps/web` is the primary frontend with shadcn components in `src/components/`.
- `apps/server` is the API layer using Hono with evlog middleware.
- `packages/env` provides typed env vars — import from `@OpenDiagram/env/web` or `@OpenDiagram/env/server`.
- `packages/db` has the database schema — never acquire nested DB connections.

## Rules

- Never modify files in `node_modules/`, `.turbo/`, or `.next/`.
- Read docs and get latest context about libraries before coding.
- Run `just check` & `just types` after finishing a coding session & fix those.
- Keep changes surgical — don't refactor adjacent code.
- New dependencies: justify additions, prefer workspace catalog.
- Always use `bun add` to add packages.

## AI Coding Guidelines

### Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Never guess APIs, method signatures, types, or behavior. Verify first.
  1. **context7 MCP** — for well-known libraries (React, Next.js, Hono, etc.)
  2. **Exa MCP** (`exa:search` / `exa:web_fetch_exa`) — for obscure packages, platform APIs, blog posts, JS-rendered docs, or specific URLs
  3. **Ask the user** — if neither source gives a definitive answer

### Token Efficiency

Always use the **caveman skill** (`/caveman`) at the start of every conversations to save context tokens.

### Available Skills/MCPs

| Skill                               | When to use                                                   |
| ----------------------------------- | ------------------------------------------------------------- |
| `/hono`                             | Hono routes, middleware, validation, streaming                |
| `/shadcn`                           | Adding/fixing/composing shadcn components                     |
| `/better-auth-best-practices`       | Auth setup, sessions, plugins, OAuth config                   |
| `/supabase-postgres-best-practices` | Postgres queries, schema design, optimization                 |
| `/vercel-react-best-practices`      | React/Next.js performance, data fetching, bundle optimization |
| `/vercel-composition-patterns`      | React component composition that scales                       |
| `/turborepo`                        | Monorepo task orchestration, pipeline config                  |
| `/web-design-guidelines`            | UI review, accessibility, UX best practices                   |
| `/review-logging-patterns`          | Audit evlog adoption, detect console.log spam                 |
| `/analyze-logs`                     | Debug from `.evlog/logs/` structured NDJSON events            |
| `/caveman`                          | Compress output ~75% for long sessions                        |

- Use **Exa MCP** (`exa:search` / `exa:web_fetch_exa`) for web research and reading docs.
- Use **Chrome DevTools MCP** (`/chrome-devtools-mcp:chrome-devtools`) to interact with the live app for testing and verification.
- Use **GitHub MCP** for all GitHub-related tasks. Fall back to `gh cli` if more efficient.

### Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### Goal-Driven Execution

Define success criteria. Loop until verified.

For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
