/**
 * The Dodo Payments client, or null when billing isn't configured.
 *
 * Null is a supported state, not a failure: a self-hosted OpenDiagram has no
 * reason to set up a payment processor, so the billing routes 404 and everyone
 * resolves to the Free plan. That's why every DODO_* var is optional in
 * packages/env -- the app must still build and boot without them.
 *
 * `DODO_ENVIRONMENT` is passed straight through because the env enum uses the
 * SDK's own `'test_mode' | 'live_mode'` values; there is deliberately no mapping
 * layer to drift out of sync.
 */
import { env } from "@OpenDiagram/env/server";
import DodoPayments from "dodopayments";

let cached: DodoPayments | null | undefined;

export function dodoClient(): DodoPayments | null {
  if (cached === undefined) {
    cached = env.DODO_PAYMENTS_API_KEY
      ? new DodoPayments({
          bearerToken: env.DODO_PAYMENTS_API_KEY,
          // Needed by `webhooks.unwrap`, which verifies the Standard Webhooks
          // signature itself. Unset here means every webhook 401s.
          webhookKey: env.DODO_WEBHOOK_SECRET,
          environment: env.DODO_ENVIRONMENT,
        })
      : null;
  }
  return cached;
}

/**
 * Whether this instance can actually sell and then honour a subscription.
 *
 * Every part has to be present, not just the API key. A key without
 * `DODO_PRO_PRODUCT_ID` shows an Upgrade button that 404s at checkout; a key
 * without `DODO_WEBHOOK_SECRET` is worse -- checkout succeeds, the customer is
 * charged, and every entitlement webhook 401s, so they never get Pro. Reporting
 * partial configuration as enabled turns a deploy mistake into a billing dispute.
 */
export function billingEnabled(): boolean {
  return dodoClient() !== null && !!env.DODO_PRO_PRODUCT_ID && !!env.DODO_WEBHOOK_SECRET;
}

/**
 * Maps an inbound Dodo `product_id` onto one of our plan rows.
 *
 * The product id is per-mode and lives only in env, so this is the single place
 * that knows "this product means Pro". An unrecognised product returns null,
 * which the webhook handler treats as "not ours" rather than silently upgrading
 * someone.
 */
export function planIdForProduct(productId: string): "pro" | null {
  return env.DODO_PRO_PRODUCT_ID && productId === env.DODO_PRO_PRODUCT_ID ? "pro" : null;
}

/** Web app origin, used for checkout and portal return URLs. */
export function appOrigin(requestOrigin?: string | null): string {
  if (requestOrigin) {
    const allowed = env.CORS_ORIGIN.split(",").map((o) => o.trim());
    if (allowed.includes(requestOrigin)) {
      return requestOrigin;
    }
  }
  return env.CORS_ORIGIN.split(",")[0]?.trim() ?? env.BETTER_AUTH_URL;
}
