import { env } from "@OpenDiagram/env/server";

/**
 * Sends `user_signed_up` to PostHog for a newly committed user row. Server-side
 * on purpose: the browser misses ad-blocked signups and GitHub signups that never
 * land on an identifying page, and "first identify" would count every pre-PostHog
 * user as new on their next login. distinct_id is the user id, the same one the
 * web app identifies with, so both sides merge into one person.
 *
 * Awaited with a short timeout rather than fired and forgotten: Cloud Run
 * throttles CPU after the response, so a detached request can be lost.
 * https://posthog.com/docs/api/capture
 */
export async function captureSignup(
  user: { id: string; email: string },
  method: string,
): Promise<void> {
  if (!env.POSTHOG_PROJECT_TOKEN || !env.POSTHOG_HOST) return;
  try {
    const res = await fetch(new URL("/i/v0/e/", env.POSTHOG_HOST), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.POSTHOG_PROJECT_TOKEN,
        event: "user_signed_up",
        distinct_id: user.id,
        // $set gives the person their email now, so the email-based test-account
        // filter applies before they ever load the web app.
        properties: { signup_method: method, $set: { email: user.email } },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.warn(`[posthog] user_signed_up capture rejected: HTTP ${res.status}`);
  } catch (error) {
    // Analytics must never fail a signup; surface it in the logs instead.
    console.warn("[posthog] user_signed_up capture failed", error);
  }
}
