import { createPrivateMetadata } from "@/lib/site";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { SettingsHeader } from "@/components/settings/settings-profile";

// Private rather than indexed: this page reads the signed-in user's plan, so the
// crawlable marketing version of pricing belongs on the landing page instead.
export const metadata = createPrivateMetadata("Pricing");

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <SettingsHeader />

      <h1 className="text-2xl font-semibold">Plans</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Pro pays for the parts that run on our infrastructure. Inference on your own key is free,
        forever.
      </p>

      <PricingPlans />
    </main>
  );
}
