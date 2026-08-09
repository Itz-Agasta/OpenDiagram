/**
 * Thin re-export of the DEV-only telemetry logger (option A).
 * Production: no-ops. Prefer importing from `#/lib/dev-telemetry` for new code.
 * Delete with `src/lib/dev-telemetry/` when removing client telemetry.
 */
export { log } from "../dev-telemetry";
