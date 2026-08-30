import { useQuery } from "@tanstack/react-query";
import { Meter } from "@cloudflare/kumo";
import { billingQueryOptions } from "#/lib/api/billing-client";
import { creationQuotaQueryOptions } from "#/lib/api/usage-client";

export function SubscriptionStatus() {
  const {
    data: state,
    isPending: isBillingPending,
    error: billingError,
  } = useQuery(billingQueryOptions);
  const {
    data: quota,
    isPending: isQuotaPending,
    error: quotaError,
  } = useQuery(creationQuotaQueryOptions);

  if (
    isBillingPending ||
    isQuotaPending ||
    billingError ||
    quotaError ||
    !state ||
    !quota ||
    !state.billingEnabled
  ) {
    return null;
  }

  const { remaining, limit, resetAt } = quota;
  const planName = state.planId === "pro" ? "Pro Plan" : "Free Plan";
  const isPro = state.planId === "pro";
  const periodText = resetAt ? "this month" : "lifetime";

  // Calculate percentage remaining (0 to 100)
  const percentage = limit > 0 ? Math.min(100, Math.max(0, (remaining / limit) * 100)) : 0;

  // Determine progress bar color based on percentage remaining
  let indicatorColor = "bg-red-500";
  if (percentage >= 80) {
    indicatorColor = "bg-green-500";
  } else if (percentage >= 20) {
    indicatorColor = "bg-yellow-500";
  }

  return (
    <div className="mb-6 rounded-2xl border border-gray-200/80 bg-white p-6 font-geist shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase select-none">
            Active Subscription
          </span>
          <h2 className="text-lg font-bold text-gray-900 mt-0.5">{planName}</h2>
        </div>
        {isPro && (
          <span className="rounded-full bg-orange px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-sm">
            Active
          </span>
        )}
      </div>

      <div className="w-full">
        <Meter
          value={percentage}
          label="Generation Allowance"
          customValue={`${remaining} of ${limit} remaining ${periodText}`}
          trackClassName="bg-gray-100"
          indicatorClassName={indicatorColor}
        />
      </div>

      {resetAt && (
        <p className="text-[10px] text-gray-400 font-semibold mt-3">
          Usage resets on {new Date(resetAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
