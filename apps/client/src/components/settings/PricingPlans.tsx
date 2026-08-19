import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, X, Lock } from "lucide-react";
import { billingQueryOptions, openBillingPortal, startCheckout } from "#/lib/api/billing-client";
import { HeroButton } from "#/components/ui/button";

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
  creditsInfo,
  featureGroupTitle,
  features,
  highlighted = false,
  children,
}: {
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  creditsInfo: { amount: string; detail: string; helperText?: string };
  featureGroupTitle: string;
  features: readonly { text: string; locked?: boolean }[];
  highlighted?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`relative rounded-2xl bg-white p-6 transition-all flex flex-col items-start ${
        highlighted ? "border-2 border-gray-900 shadow-sm" : "border border-gray-200/80"
      } font-geist w-full`}
    >
      {highlighted && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-blue-600 px-3 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider shadow-sm">
          Best Value
        </span>
      )}

      {/* Header */}
      <h2 className={`text-base font-bold ${highlighted ? "text-gray-900" : "text-gray-500"}`}>
        {name}
      </h2>
      <p className="mt-1 text-xs text-gray-500 leading-normal mb-4">{tagline}</p>

      {/* Dynamic Credit Nested Box */}
      <div className="w-full rounded-xl bg-gray-50 border border-gray-200/60 p-4 flex flex-col gap-1 mb-5">
        <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <span className="text-blue-600 font-medium">✦</span>
          <span>{creditsInfo.amount}</span>
        </div>
        <p className="text-xs text-gray-500 font-medium leading-normal">{creditsInfo.detail}</p>
        {creditsInfo.helperText && (
          <div className="mt-2 border-t border-gray-200/40 pt-2 text-[10px] text-gray-400 font-semibold flex items-center gap-1">
            <span className="text-blue-600 font-medium">✓</span>
            <span>{creditsInfo.helperText}</span>
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="flex flex-col mb-4">
        <div className="flex items-baseline text-gray-900">
          <span className="text-3xl font-extrabold tracking-tight">{price}</span>
          {priceSuffix && (
            <span className="ml-1 text-xs font-semibold text-gray-500">{priceSuffix}</span>
          )}
        </div>
      </div>

      {/* Children Actions (Upgrade button / code input / Current plan) */}
      <div className="w-full mb-4">{children}</div>

      {/* Divider */}
      <div className="w-full border-t border-gray-200/60 my-2" />

      {/* Feature Groups */}
      <div className="w-full mt-2">
        <h3 className="text-[10px] font-bold tracking-wider text-gray-400 uppercase flex items-center gap-1.5 mb-3 select-none">
          <Lock className="size-3 text-gray-400" />
          <span>{featureGroupTitle}</span>
        </h3>
        <ul className="space-y-2.5 text-sm">
          {features.map((feature) => {
            const text = feature.text;
            const locked = feature.locked || false;

            return (
              <li key={text} className="flex gap-2.5 items-start">
                {locked ? (
                  <X className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden="true" />
                ) : (
                  <Check className="mt-0.5 size-4 shrink-0 text-gray-900" aria-hidden="true" />
                )}
                <span className={locked ? "text-gray-400 font-normal" : "text-gray-500"}>
                  {text}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
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
        <div className="h-96 rounded-2xl bg-gray-100 animate-pulse border border-gray-200/50" />
        <div className="h-96 rounded-2xl bg-gray-100 animate-pulse border border-gray-200/50" />
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

  const freeCardFeatures = [
    { text: "AI diagrams to start, then a monthly refresh" },
    { text: "Unlimited diagrams with your own AI key" },
    { text: "3 projects" },
    { text: "7-day version history" },
    { text: "GitHub import and codebase understanding", locked: true },
    { text: "Unlimited projects", locked: true },
    { text: "90-day version history", locked: true },
    { text: "Email support", locked: true },
  ];

  const proCardFeatures = proFeatures(state.proCredits).map((feature) => ({ text: feature }));

  return (
    <div className="font-geist">
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Free Plan Card */}
        <PlanCard
          name="Free"
          tagline="Everything you need to try it properly."
          creditsInfo={{
            amount: `${state.credits.limit} credits / period`,
            detail: `= ${state.credits.limit} AI diagram generations`,
            helperText: `Fixed allowance of ${state.credits.limit} credits`,
          }}
          price="$0"
          priceSuffix="per month, free forever"
          featureGroupTitle="Core Capabilities"
          features={freeCardFeatures}
        >
          {isPro ? (
            <button
              disabled
              className="w-full flex items-center justify-center h-9 rounded-xl border border-gray-100 bg-gray-50 text-xs font-semibold text-gray-400 select-none cursor-default"
            >
              Downgrade Locked
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                disabled
                className="w-full flex items-center justify-center h-9 rounded-xl border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 select-none cursor-default"
              >
                Current Plan
              </button>
              <p className="text-[10px] text-gray-400 font-semibold mt-1 text-center truncate">
                {allowance}
              </p>
            </div>
          )}
        </PlanCard>

        {/* Pro Plan Card */}
        <PlanCard
          name="Pro"
          tagline="For everyday system architects."
          creditsInfo={{
            amount: `${state.proCredits} credits / month`,
            detail: `= ${state.proCredits} AI diagram generations`,
            helperText: "Renewing monthly allowance",
          }}
          price="$8"
          priceSuffix="/ month, cancel anytime"
          featureGroupTitle="Advanced Capabilities"
          features={proCardFeatures}
          highlighted
        >
          {isPro ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void go("portal")}
                disabled={pending !== null}
                className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="flex flex-col gap-0.5 mt-1 text-center">
                <p className="text-[10px] text-gray-400 font-semibold truncate">{allowance}</p>
                {sub && (
                  <p className="text-[9px] text-gray-400 font-medium">
                    {sub.cancelAtPeriodEnd ? "Access ends" : "Renews"} on{" "}
                    {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )}
              </div>
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
                text="Unlock Pro Access"
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
