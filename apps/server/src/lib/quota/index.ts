/**
 * Quota and billing enforcement for every AI path.
 *
 *   enforce.ts       enforceAiQuota() -- the one gate routes call, plus the
 *                    in-process burst and concurrency limits
 *   actor.ts         who's asking: guest cookie identity, plan table read,
 *                    billing window math, and the plan a request resolves to
 *   credits.ts       the user-facing credit counter (consume / refund / read)
 *   cost-ceiling.ts  micro-dollar ledger: reserve, settle, release
 *   errors.ts        quota error types and their HTTP mapping
 *
 * Routes import from here, not from the individual files.
 */
export {
  getCreationQuotaActor,
  getPlan,
  getUserActor,
  peekCreationQuotaActor,
  type CreationQuotaActor,
  type Plan,
} from "./actor";
// Credit *consumption* is deliberately NOT exported: every AI path goes through
// enforceAiQuota, which requires the resolved model and so can't forget the BYOK
// bypass. Reaching past it is what let BYOK users be charged on project chat.
// `exhaustCreationQuota` is the opposite direction (refund clawback), so it has
// no such hazard.
export {
  exhaustCreationQuota,
  getCreationQuotaSnapshot,
  type CreationQuotaSnapshot,
} from "./credits";
export { enforceAiBurst, enforceAiQuota, type AiQuotaGrant } from "./enforce";
export {
  applyCreationQuotaHeaders,
  AiRateLimitError,
  CostCeilingExceededError,
  CreationQuotaExceededError,
  isQuotaError,
  quotaErrorResponse,
} from "./errors";
