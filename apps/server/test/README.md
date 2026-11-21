# Server tests

`just test` from the repo root runs them; `bun test test` here runs only these.

The layout mirrors `src/`: `agent/` for the agent loop and layout fixer, `quota/` for credits, `routes/` for HTTP routes, top-level files for single modules (`scene-delta.test.ts`).

`support/` holds what the tests share:

- `preload.ts` (loaded through `bunfig.toml`) swaps three modules with process-wide side effects: the server env (no test may depend on real secrets), telemetry, and `@OpenDiagram/db`, which becomes PGlite.
- `db.ts`: PGlite, Postgres compiled to WASM, built from the real migrations. `resetDb()` empties every table; call it in `beforeEach`. Single connection, so locks and two-session behaviour are out of reach.
- `model.ts`: `scriptedModel` answers each model call with the next scripted turn (tool call, text, JSON or an error). No real model in tests.

Same rules as the harness tests: assert the intended behaviour, never output copied from a run, and prove each test by breaking the line it guards.

CI has no `.env`. To run the way CI does:

```bash
env -i PATH=$PATH HOME=$HOME CI=true DOTENV_CONFIG_PATH=/dev/null bun --no-env-file test test
```
