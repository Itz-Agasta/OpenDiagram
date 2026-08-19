import { createFileRoute } from "@tanstack/react-router";
import { PricingPlans } from "#/components/settings/PricingPlans";
import { SettingsHeader } from "#/components/settings/profile";

export const Route = createFileRoute("/_protected/pricing")({
  component: PricingPageRoute,
});

function PricingPageRoute() {
  return (
    <div className="min-h-screen w-full bg-gray-50/30 overflow-y-auto font-geist">
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <SettingsHeader />

        <h1 className="text-2xl font-semibold mb-2 heading-font text-gray-900">Plans</h1>
        <p className="mt-1 mb-6 text-sm text-gray-500 body-font">
          Pro pays for the parts that run on our infrastructure. Inference on your own key is free,
          forever.
        </p>

        <PricingPlans />
      </main>
    </div>
  );
}
