import { LockKeyhole } from "lucide-react";
import { createPrivateMetadata } from "@/lib/site";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { Providers } from "@/components/settings/providers";
import { SettingsHeader, SettingsProfileCard } from "@/components/settings/settings-profile";

export const metadata = createPrivateMetadata("Settings");

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <SettingsHeader />

      <SettingsProfileCard />

      <h1 className="text-2xl font-semibold">Plan</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Your current allowance, and where to upgrade or cancel.
      </p>

      <div className="mb-10">
        <PricingPlans />
      </div>

      <h1 className="text-2xl font-semibold">AI providers</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Bring your own key to run diagram generation on your own AI subscription.
      </p>

      <div className="mb-6 flex items-center gap-3 rounded-lg border border-od-border-soft bg-od-canvas/35 px-4 py-3 text-sm text-od-ink-muted">
        <LockKeyhole className="size-4 shrink-0 self-center text-od-ink" aria-hidden="true" />
        <p className="min-w-0 flex-1 leading-relaxed">
          We never store your raw API credentials. Keys are encrypted before storage and are only
          used to make requests to your selected provider.
        </p>
      </div>

      <Providers />
    </main>
  );
}
