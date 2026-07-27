import { env } from "@OpenDiagram/env/web";

export type BillingState = {
  /** False on a self-hosted instance with no Dodo keys — hide all upgrade UI. */
  billingEnabled: boolean;
  planId: "guest" | "free" | "pro";
  credits: { limit: number; resetAt: string | null };
  /** Pro's monthly allowance, read from the `plan` table so copy can't go stale. */
  proCredits: number;
  subscription: {
    status: "pending" | "active" | "on_hold" | "cancelled" | "failed" | "expired";
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
};

const BASE = `${env.NEXT_PUBLIC_SERVER_URL}/api/billing`;

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export async function getBillingState(): Promise<BillingState> {
  const response = await fetch(BASE, { credentials: "include" });
  if (!response.ok) throw new Error(await readError(response, "Failed to load billing."));
  return response.json();
}

/** Returns the Dodo-hosted checkout URL to redirect to. */
export async function startCheckout(discountCode?: string): Promise<string> {
  const response = await fetch(`${BASE}/checkout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(discountCode ? { discountCode } : {}),
  });
  if (!response.ok) throw new Error(await readError(response, "Could not start checkout."));
  const { checkoutUrl } = (await response.json()) as { checkoutUrl: string };
  return checkoutUrl;
}

/** Returns the Dodo-hosted portal URL: cancel, resume, card, invoices. */
export async function openBillingPortal(): Promise<string> {
  const response = await fetch(`${BASE}/portal`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readError(response, "Could not open billing portal."));
  const { portalUrl } = (await response.json()) as { portalUrl: string };
  return portalUrl;
}
