import { Hono } from "hono";
import {
  applyCreationQuotaHeaders,
  getCreationQuotaSnapshot,
  getPlan,
  peekCreationQuotaActor,
} from "../lib/quota";

export const usageRoute = new Hono();

usageRoute.get("/creation-quota", async (c) => {
  // Peek, not resolve: the resolving variant issues a guest cookie as a side
  // effect, so polling this endpoint would mint a fresh guest identity per call.
  const actor = await peekCreationQuotaActor(c);
  if (!actor) {
    return c.json({ quota: null });
  }
  const quota = await getCreationQuotaSnapshot(actor);

  // What signing up is worth, for the guest upsell. Served from the plan table
  // rather than written into the frontend: the grant is data precisely so it can
  // change without a deploy (25 during launch, 15 after), and the UI was still
  // promising the long-deleted USER_LIMIT of 10.
  const free = await getPlan("free");
  const signupCredits = free.signupGrant || free.monthlyCredits;

  applyCreationQuotaHeaders(c, quota);
  c.header("Cache-Control", "private, no-store");
  return c.json({ quota: { ...quota, signupCredits } });
});
