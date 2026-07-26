/**
 * Dodo Payments integration.
 *
 *   client.ts             the SDK client (null when billing is unconfigured),
 *                         product -> plan mapping, and the app return-URL origin
 *   subscription-sync.ts  what an inbound event means for entitlement: the
 *                         `subscription` upsert and the refund clawback
 *
 * Routes import from here, not from the individual files -- matching lib/quota.
 * `subscription-sync` is the one exception: only the webhook route may call it,
 * so it is deliberately NOT re-exported. Entitlement must follow verified Dodo
 * events, and a barrel export invites some other route to write that table.
 */
export { appOrigin, dodoClient, planIdForProduct } from "./client";
