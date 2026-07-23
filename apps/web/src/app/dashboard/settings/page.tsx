import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createPrivateMetadata } from "@/lib/site";
import { AiProviders } from "@/components/settings/ai-providers";

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

      <AiProviders />
    </main>
  );
}
