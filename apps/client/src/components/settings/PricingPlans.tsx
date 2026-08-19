import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { billingQueryOptions, openBillingPortal, startCheckout } from "#/lib/api/billing-client";
import { HeroButton } from "#/components/ui/button";

const FREE_FEATURES = [
  "AI diagrams to start, then a monthly refresh",
  "Unlimited diagrams with your own AI key",
  "3 projects",
  "7-day version history",
] as const;

function proFeatures(monthlyCredits: number): readonly string[] {
  return [
    `${monthlyCredits} AI diagrams a month`,
    "Unlimited diagrams with your own AI key",
    "GitHub import and codebase understanding",
    "Unlimited projects",
    "90-day version history",
    "Email support",
  ];
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-500 font-geist">
      {children}
    </p>
  );
}

function PlanCard({
  name,
  price,
  priceSuffix,
  tagline,
  features,
  highlighted = false,
  children,
}: {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: readonly string[];
  highlighted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl bg-white p-6 transition-all ${
        highlighted ? "border-2 border-gray-900 shadow-sm" : "border border-gray-200/80"
      } font-geist`}
    >
      <h2 className={`text-sm font-semibold ${highlighted ? "text-gray-900" : "text-gray-500"}`}>
        {name}
      </h2>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
        {price}
        {priceSuffix && <span className="text-base font-normal text-gray-500"> {priceSuffix}</span>}
      </p>
      <p className="mt-1.5 text-xs text-gray-500 leading-normal">{tagline}</p>

      <ul className="mt-6 space-y-2.5 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-gray-900" aria-hidden="true" />
            <span className="text-gray-500">{feature}</span>
          </li>
        ))}
      </ul>

      {children && <div className="mt-6">{children}</div>}
    </section>
  );
}

export function PricingPlans() {
  const { data: state, error: loadError, isPending } = useQuery(billingQueryOptions);
  const [discountCode, setDiscountCode] = useState("");
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  if (loadError)
    return (
      <Notice>{loadError instanceof Error ? loadError.message : "Failed to load billing."}</Notice>
    );

  if (isPending || !state) {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="h-80 rounded-xl bg-gray-100 animate-pulse border border-gray-200/50" />
        <div className="h-80 rounded-xl bg-gray-100 animate-pulse border border-gray-200/50" />
      </div>
    );
  }

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
    <div className="font-geist">
      <div className="grid gap-5 sm:grid-cols-2">
        <PlanCard
          name="Free"
          price="$0"
          tagline="Everything you need to try it properly."
          features={FREE_FEATURES}
        >
          {!isPro && <p className="text-xs font-semibold text-gray-900">{allowance}</p>}
        </PlanCard>

        <PlanCard
          name="Pro"
          price="$8"
          priceSuffix="/ month"
          tagline={`${state.proCredits} AI diagrams. Eraser gives you 40 for $20.`}
          features={proFeatures(state.proCredits)}
          highlighted
        >
          {isPro ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-gray-900">{allowance}</p>
              {sub && (
                <p className="text-xs text-gray-500">
                  {sub.cancelAtPeriodEnd ? "Access ends" : "Renews"} on{" "}
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              <button
                onClick={() => void go("portal")}
                disabled={pending !== null}
                className="mt-2 w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending === "portal" ? (
                  <Loader2 className="size-4 animate-spin text-gray-900" aria-hidden="true" />
                ) : (
                  <>
                    <ExternalLink className="size-3.5 text-gray-900" aria-hidden="true" />
                    Manage billing
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={discountCode}
                onChange={(event) => setDiscountCode(event.target.value)}
                placeholder="Promo code (optional)"
                aria-label="Promo code"
                autoComplete="off"
                spellCheck={false}
                disabled={pending !== null}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:border-gray-400 transition font-geist text-gray-900"
              />
              <HeroButton
                text="Upgrade to Pro"
                color="blue"
                onClick={() => void go("checkout")}
                disabled={pending !== null}
                className="w-full justify-center h-9 text-xs font-semibold rounded-xl cursor-pointer"
              />
              {pending === "checkout" && (
                <div className="flex justify-center pt-1">
                  <Loader2 className="size-4 animate-spin text-blue-600" />
                </div>
              )}
            </div>
          )}
        </PlanCard>
      </div>

      {actionError && <p className="mt-4 text-xs text-red-600 font-semibold">{actionError}</p>}

      <p className="mt-6 text-xs text-gray-500 leading-normal">
        Payments are handled by Dodo Payments, our Merchant of Record. Cancel any time from Manage
        billing. Bringing your own AI key is always free and unlimited.
      </p>
    </div>
  );
}
