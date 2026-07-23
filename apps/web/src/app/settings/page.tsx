"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { AiProviders } from "@/components/settings/ai-providers";
import { ProfileSkeleton, SectionTitle, SettingsRow } from "@/components/settings/settings-ui";

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export default function SettingsPage() {
  const router = useRouter();
  const session = authClient.useSession();
  const user = session.data?.user;

  useEffect(() => {
    if (!session.isPending && !user) router.replace("/login");
  }, [router, session.isPending, user]);

  if (session.isPending || !user) return <ProfileSkeleton />;

  return (
    <main className="product-ui min-h-dvh bg-od-surface px-4 py-8 text-od-ink md:px-8 md:py-12">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-od-body text-od-ink-muted transition hover:text-od-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>

        <header className="mt-8 pb-2">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-od-ink md:text-[32px]">
            Settings
          </h1>
          <p className="mt-1 text-od-body text-od-ink-faint">
            Account and AI providers for your workspace.
          </p>
        </header>

        <div className="mt-10 space-y-12">
          <section className="space-y-1">
            <SectionTitle>Account</SectionTitle>
            <SettingsRow label="Name">{user.name || "—"}</SettingsRow>
            <SettingsRow label="Email">{user.email || "—"}</SettingsRow>
            <SettingsRow label="Email status">
              {user.emailVerified ? "Verified" : "Unverified"}
            </SettingsRow>
            <SettingsRow label="Member since">
              {formatDate((user as { createdAt?: unknown }).createdAt)}
            </SettingsRow>
          </section>

          <section className="space-y-4">
            <SectionTitle>AI providers</SectionTitle>
            <AiProviders />
          </section>
        </div>
      </div>
    </main>
  );
}
