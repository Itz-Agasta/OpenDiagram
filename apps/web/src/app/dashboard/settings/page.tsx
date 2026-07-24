import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { createPrivateMetadata } from "@/lib/site";
import { Providers } from "@/components/settings/providers";

export const metadata = createPrivateMetadata("Settings");

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>

      <h1 className="text-2xl font-semibold">AI providers</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Bring your own key to run diagram generation on your own AI subscription.
      </p>

      <div className="mb-6 flex gap-3 rounded-lg border border-od-border-soft bg-od-canvas/35 px-4 py-3 text-sm text-od-ink-muted">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-od-ink" aria-hidden="true" />
        <p>
          We never store your raw API credentials. Keys are encrypted before storage and are only
          used to make requests to your selected provider.
        </p>
      </div>

      <Providers />
    </main>
  );
}
