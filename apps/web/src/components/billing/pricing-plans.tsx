"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  getBillingState,
  openBillingPortal,
  startCheckout,
  type BillingState,
} from "@/lib/billing-client";
import { PlanCard } from "@/components/billing/plan-card";
import { FREE_FEATURES, PRO_FEATURES } from "@/components/billing/plan-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-od-border-soft bg-od-canvas/35 px-4 py-3 text-sm text-od-ink-muted">
      {children}
    </p>
  );
}

export function PricingPlans() {
  const [state, setState] = useState<BillingState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    getBillingState()
      .then(setState)
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Failed to load billing.");
      });
  }, []);

  // Both actions end in a redirect to a Dodo-hosted page, so `pending` is cleared
  // only on failure -- the spinner should stay up until the navigation happens
  // rather than flicker back to an enabled button.
  async function go(kind: "checkout" | "portal") {
    setActionError(null);
    setPending(kind);
    try {
      window.location.href =
        kind === "checkout"
          ? await startCheckout(discountCode.trim() || undefined)
          : await openBillingPortal();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Something went wrong.");
      setPending(null);
    }
  }

  if (loadError) return <Notice>{loadError}</Notice>;

  if (!state) {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  // Self-hosted with no Dodo keys: there is nothing to sell, so say that rather
  // than showing an upgrade button that 404s.
  if (!state.billingEnabled) {
    return (
      <Notice>
        Billing isn&apos;t configured on this instance. Every account has the Free allowance, and
        your own AI key gives unlimited diagrams.
      </Notice>
    );
  }

  const isPro = state.planId === "pro";
  const sub = state.subscription;
  const allowance = `Your current plan · ${state.credits.limit} credits this period`;

  return (
    <div>
      <div className="grid gap-5 sm:grid-cols-2">
        <PlanCard
          name="Free"
          price="$0"
          tagline="Everything you need to try it properly."
          features={FREE_FEATURES}
        >
          {!isPro && <p className="text-sm font-medium text-od-ink">{allowance}</p>}
        </PlanCard>

        <PlanCard
          name="Pro"
          price="$8"
          priceSuffix="/ month"
          tagline="150 AI diagrams. Eraser gives you 40 for $20."
          features={PRO_FEATURES}
          highlighted
        >
          {isPro ? (
            <div>
              <p className="text-sm font-medium text-od-ink">{allowance}</p>
              {sub && (
                <p className="mt-1 text-sm text-od-ink-muted">
                  {sub.cancelAtPeriodEnd ? "Access ends" : "Renews"} on{" "}
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => void go("portal")}
                disabled={pending !== null}
              >
                {pending === "portal" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ExternalLink className="size-4" aria-hidden="true" />
                )}
                Manage billing
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                value={discountCode}
                onChange={(event) => setDiscountCode(event.target.value)}
                placeholder="Promo code (optional)"
                aria-label="Promo code"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                className="w-full"
                onClick={() => void go("checkout")}
                disabled={pending !== null}
              >
                {pending === "checkout" && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                Upgrade to Pro
              </Button>
            </div>
          )}
        </PlanCard>
      </div>

      {actionError && <p className="mt-4 text-sm text-destructive">{actionError}</p>}

      <p className="mt-6 text-sm text-od-ink-muted">
        Payments are handled by Dodo Payments, our Merchant of Record. Cancel any time from Manage
        billing. Bringing your own AI key is always free and unlimited.
      </p>
    </div>
  );
}
