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

        <h1 className="pricing-hero-heading mb-3 text-gray-900">
          Get unlimited diagrams and codebase imports
        </h1>
        <p className="pricing-hero-tagline mb-8 text-gray-500">
          Pro covers the infrastructure for complex generations. Bring your own key anytime for
          free, unlimited diagrams.
        </p>

        <PricingPlans />

        <div className="mt-16 border-t border-gray-200/80 pt-10">
          <h2 className="pricing-section-title text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 font-geist">
                How do credits work?
              </h3>
              <p className="text-xs leading-relaxed text-gray-500 font-geist">
                Your allowance resets at the start of each billing cycle. If you hit your limit, you
                can instantly plug in your own OpenAI/Gemini API key in Settings to continue
                designing for free.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 font-geist">
                Can I cancel my subscription?
              </h3>
              <p className="text-xs leading-relaxed text-gray-500 font-geist">
                Yes, you can cancel your plan in one click at any time from your settings page. You
                will retain all Pro features until the end of your current billing period.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 font-geist">
                Who handles payments?
              </h3>
              <p className="text-xs leading-relaxed text-gray-500 font-geist">
                All payments are processed securely by Dodo Payments (our Merchant of Record). We
                never see, store, or process your raw credit card details.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 font-geist">
                Do I need a paid plan to use my own key?
              </h3>
              <p className="text-xs leading-relaxed text-gray-500 font-geist">
                No, bringing your own AI key is completely free. You can use it to generate
                unlimited diagrams without ever subscribing to the Pro tier.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
