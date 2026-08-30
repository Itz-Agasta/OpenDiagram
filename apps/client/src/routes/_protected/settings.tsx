import { createFileRoute } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { SettingsHeader, SettingsProfileCard } from "#/components/settings/profile";
import { Providers } from "#/components/settings/providers";
import { PricingPlans } from "#/components/settings/PricingPlans";
import { SubscriptionStatus } from "#/components/settings/SubscriptionStatus";

export const Route = createFileRoute("/_protected/settings")({
  component: SettingsPageRoute,
});

function SettingsPageRoute() {
  return (
    <div className="min-h-screen w-full bg-gray-50/30 overflow-y-auto font-geist">
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <SettingsHeader />
        <SettingsProfileCard />
        <SubscriptionStatus />
        <h1 className="text-2xl font-semibold mb-2 heading-font text-gray-900 mt-10">Plan</h1>
        <p className="mt-1 mb-6 text-sm text-gray-500 body-font">
          Your current allowance, and where to upgrade or cancel.
        </p>

        <div className="mb-10">
          <PricingPlans />
        </div>
        <h1 className="text-2xl font-semibold mb-2 heading-font text-gray-900 mt-10">
          AI providers
        </h1>
        <p className="mt-1 mb-6 text-sm text-gray-500 body-font">
          Bring your own key to run diagram generation on your own AI subscription.
        </p>

        <div className="mb-6 flex items-center gap-3 rounded-lg border border-gray-200/80 bg-white px-4 py-3 text-sm text-gray-600 body-font">
          <LockKeyhole className="size-4 shrink-0 self-center text-gray-900" aria-hidden="true" />
          <p className="min-w-0 flex-1 leading-relaxed">
            We never store your raw API credentials. Keys are encrypted before storage and are only
            used to make requests to your selected provider.
          </p>
        </div>

        <Providers />
      </main>
    </div>
  );
}
