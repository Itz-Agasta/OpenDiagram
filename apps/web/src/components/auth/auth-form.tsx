"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="h-4 w-4">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58l-.01-2.05c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

// Only allow internal, non-protocol-relative paths so a crafted
// `?redirect=` can't bounce the user to an external site after login.
function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/dashboard";
  }
  return raw;
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const redirectParam = params.get("redirect");
  const redirectTo = safeRedirect(redirectParam);
  const isSignup = mode === "signup";
  const switchHref =
    `${isSignup ? "/login" : "/signup"}` +
    (redirectParam ? `?redirect=${encodeURIComponent(redirectTo)}` : "");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [githubPending, setGithubPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { error: authError } = isSignup
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password });

    if (authError) {
      setError(authError.message || "Something went wrong. Please try again.");
      setPending(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  async function onGithub() {
    setGithubPending(true);
    setError(null);
    try {
      // Absolute URLs on THIS (web) origin -- better-auth resolves relative
      // callbackURLs against the server's baseURL, which sends users to the API
      // origin (:3000) instead of the web app in a split deployment.
      const errorCallbackURL =
        `${window.location.origin}/login` +
        (redirectParam ? `?redirect=${encodeURIComponent(redirectTo)}` : "");
      await authClient.signIn.social({
        provider: "github",
        callbackURL: `${window.location.origin}${redirectTo}`,
        errorCallbackURL,
      });
    } catch {
      setError("Could not start GitHub sign in.");
      setGithubPending(false);
    }
  }

  return (
    <div className="w-full max-w-[400px] rounded-[16px] border border-od-border-soft bg-od-surface p-6 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.55)]">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold text-od-ink">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-[13px] text-od-ink-muted">
          {isSignup
            ? "Save your diagrams to your workspace."
            : "Log in to access your saved projects."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-3">
        {isSignup && (
          <label className="grid gap-1.5 text-[13px] font-medium text-od-ink-muted">
            Name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ada Lovelace"
              required
              autoComplete="name"
            />
          </label>
        )}
        <label className="grid gap-1.5 text-[13px] font-medium text-od-ink-muted">
          Email
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </label>
        <label className="grid gap-1.5 text-[13px] font-medium text-od-ink-muted">
          Password
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
        </label>

        {error && <p className="text-[13px] text-red-600">{error}</p>}

        <Button
          type="submit"
          disabled={pending}
          className="mt-1 cursor-pointer disabled:cursor-wait"
        >
          {pending ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-[12px] text-od-ink-faint">
        <span className="h-px flex-1 bg-od-border-soft" />
        or
        <span className="h-px flex-1 bg-od-border-soft" />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={onGithub}
        disabled={githubPending}
        className="w-full cursor-pointer disabled:cursor-wait"
      >
        <GithubMark />
        {githubPending ? "Opening GitHub..." : "Continue with GitHub"}
      </Button>

      <p className="mt-6 text-center text-[13px] text-od-ink-muted">
        {isSignup ? "Already have an account? " : "New to OpenDiagram? "}
        <Link
          href={switchHref}
          className="font-medium text-od-ink underline-offset-4 hover:underline"
        >
          {isSignup ? "Log in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
