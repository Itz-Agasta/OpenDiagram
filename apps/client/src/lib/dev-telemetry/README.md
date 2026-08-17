# Dev telemetry (delete-friendly)

Client-side **dev-only** API + page timing via [evlog](https://evlog.dev).  
Production: all hooks no-op / plain `fetch` (`import.meta.env.DEV` + Vite `apply: "serve"`).

## Where logs go

| Sink      | Location                                                                  |
| --------- | ------------------------------------------------------------------------- |
| Console   | Browser DevTools                                                          |
| **Files** | monorepo root **`.evlog/logs/YYYY-MM-DD.jsonl`** (same dir as the server) |

Flow: browser `log.*` → HTTP POST `/__dev/evlog` → Vite middleware → `createFsDrain` → `.evlog/logs`.

Filter client lines by `"service":"client-app-dev"`.

```bash
# from repo root
ls .evlog/logs/
tail -f .evlog/logs/$(date +%Y-%m-%d).jsonl
```

## Event types

| `type`           | Fields                                           |
| ---------------- | ------------------------------------------------ |
| `api`            | `method`, `path`, `status`, `durationMs`, `ok`   |
| `page_load`      | `path`, `ttfbMs`, `domContentLoadedMs`, `loadMs` |
| `route`          | `path`, `durationMs`                             |
| `query_error`    | React Query failures                             |
| `mutation_error` | React Query mutation failures                    |

Bodies and headers are never logged.

## Call sites outside this folder

1. `src/lib/api/project.ts` — `getDevFetch()`
2. `src/lib/api/auth-client.ts` — `fetchOptions.customFetchImpl`
3. `src/router.tsx` — query/mutation errors + `trackRouter` / `trackPageLoads`
4. `src/lib/utils/logger.ts` — thin re-export of `log`
5. `vite.config.ts` — `devEvlogFilePlugin()`

## How to delete

```bash
rm -rf apps/client/src/lib/dev-telemetry
```

Then:

1. `project.ts` — use `fetch` again; drop `getDevFetch` import
2. `auth-client.ts` — remove `fetchOptions`
3. `router.tsx` — remove `devTelemetry` imports and bootstrap
4. `utils/logger.ts` — remove or leave a stub
5. `vite.config.ts` — remove `devEvlogFilePlugin` import + plugin entry
6. Optional: remove `evlog` from `apps/client/package.json` if unused
