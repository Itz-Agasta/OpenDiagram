"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient, safeFrontendPath } from "@/lib/auth-client";
import { scoreStrength } from "./auth-components";

export type AuthTab = "signin" | "signup";

function emailIsValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * The OAuth callback reports failures by redirecting to `errorCallbackURL` with
 * `?error=<code>` (better-auth `oauth2/errors.mjs`, via `api/routes/callback.mjs`,
 * which converts its internal spaced strings with `.split(" ").join("_")`).
 * Without this the user landed back on a blank sign-in form with no idea why.
 *
 * `account_not_linked` is the one that actually happens here, and it reads as a
 * bug until you know the rule: Better Auth refuses to implicitly link a GitHub
 * account to an existing local account whose email is still unverified. That is
 * CVE-2026-53516 -- otherwise anyone able to register an unverified account at a
 * known address could take it over by signing in through the provider. Since
 * this app treats verification as a soft gate, plenty of accounts sit unverified
 * indefinitely, so real users meet this. The fix is to verify, not to relax the
 * gate: `account.accountLinking.requireLocalEmailVerified` is deprecated and
 * documented for removal in the next minor, when the check becomes unconditional.
 */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  account_not_linked:
    "An account already exists for that email, but it isn't linked to GitHub yet. Sign in with your password below, then verify your email -- after that, GitHub sign-in will work.",
  unable_to_link_account:
    "We couldn't link that GitHub account. Try signing in with your password.",
  "email_doesn't_match": "That GitHub account uses a different email than the one on file.",
  account_already_linked_to_different_user:
    "That GitHub account is already linked to a different OpenDiagram account.",
  email_not_found:
    "GitHub didn't share an email address. Add a public email to your GitHub account, or sign in with a password.",
};

function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? "GitHub sign-in failed. Try signing in with your password.";
}

export function useAuthForm(initialTab: AuthTab) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeFrontendPath(searchParams.get("redirect"));
  const [tab, setTab] = useState<AuthTab>(
    searchParams.get("tab") === "signup" ? "signup" : initialTab,
  );
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [siEmail, setSiEmail] = useState("");
  const [siPwd, setSiPwd] = useState("");
  const [siRemember, setSiRemember] = useState(true);
  const [suFirst, setSuFirst] = useState("");
  const [suLast, setSuLast] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPwd, setSuPwd] = useState("");
  const [suTerms, setSuTerms] = useState(false);
  const [notice, setNotice] = useState<string | null>(() =>
    oauthErrorMessage(searchParams.get("error")),
  );
  // Only `account_not_linked` is fixed by verifying an email, so the resend
  // control is offered for that case alone rather than on every OAuth failure.
  const [canResend, setCanResend] = useState(
    () => searchParams.get("error") === "account_not_linked",
  );
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && session?.user) router.replace(redirectTo);
  }, [isPending, redirectTo, router, session]);

  const siErrors = useMemo(() => {
    if (!submitted) return {} as Record<string, string>;
    const errors = {} as Record<string, string>;
    if (!siEmail) errors.email = "Email is required";
    else if (!emailIsValid(siEmail)) errors.email = "Enter a valid email";
    if (!siPwd) errors.password = "Password is required";
    return errors;
  }, [submitted, siEmail, siPwd]);

  const suErrors = useMemo(() => {
    if (!submitted) return {} as Record<string, string>;
    const errors = {} as Record<string, string>;
    if (!suFirst.trim()) errors.first = "Required";
    if (!suLast.trim()) errors.last = "Required";
    if (!suEmail) errors.email = "Email is required";
    else if (!emailIsValid(suEmail)) errors.email = "Enter a valid email";
    if (!suPwd) errors.password = "Create a password";
    else if (suPwd.length < 8) errors.password = "Use at least 8 characters";
    if (!suTerms) errors.terms = "Please accept the terms";
    return errors;
  }, [submitted, suEmail, suFirst, suLast, suPwd, suTerms]);

  /**
   * The only way to re-request a verification mail. `emailVerification
   * .sendOnSignIn` looks like it covers this, but in better-auth 1.6.22 that
   * branch sits *inside* the `requireEmailVerification` guard
   * (`api/routes/sign-in.mjs`), which this app deliberately leaves unset so that
   * verification stays a soft gate -- so the option never fires. Hence an
   * explicit control rather than a config flag.
   *
   * No `callbackURL` here on purpose: the server's `sendVerificationEmail` hook
   * rewrites the link's callback to the dashboard regardless, so passing one
   * would suggest a choice the client does not actually get.
   */
  async function resendVerification() {
    if (!emailIsValid(siEmail)) {
      setNotice("Enter the email address on your account first, then resend.");
      return;
    }
    setResendState("sending");
    const { error } = await authClient.sendVerificationEmail({ email: siEmail });
    if (error) {
      setResendState("idle");
      setNotice(error.message || "Could not send the verification email. Try again shortly.");
      return;
    }
    setResendState("sent");
    setNotice(`Verification email sent to ${siEmail}. Check your inbox, then sign in with GitHub.`);
  }

  function finishAuthentication() {
    setSuccess(true);
    setTimeout(() => {
      router.push(redirectTo);
      router.refresh();
    }, 500);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const errors = tab === "signin" ? siErrors : suErrors;
    const visibleErrors = submitted ? errors : validateCurrentValues();
    if (Object.keys(visibleErrors).length > 0) return;
    setLoading(true);

    try {
      const callbacks = {
        onRequest: () => setLoading(true),
        onSuccess: finishAuthentication,
        onError: (ctx: { error: { message?: string } }) => {
          setLoading(false);
          alert(
            ctx.error.message ||
              (tab === "signin" ? "Invalid email or password" : "Failed to create account"),
          );
        },
      };
      if (tab === "signin") {
        await authClient.signIn.email(
          { email: siEmail, password: siPwd, rememberMe: siRemember },
          callbacks,
        );
      } else {
        await authClient.signUp.email(
          { email: suEmail, password: suPwd, name: `${suFirst} ${suLast}`.trim() },
          callbacks,
        );
      }
    } catch {
      setLoading(false);
      alert("Something went wrong. Please try again.");
    }
  }

  function validateCurrentValues() {
    const errors = {} as Record<string, string>;
    if (tab === "signin") {
      if (!siEmail) errors.email = "Email is required";
      else if (!emailIsValid(siEmail)) errors.email = "Enter a valid email";
      if (!siPwd) errors.password = "Password is required";
      return errors;
    }
    if (!suFirst.trim()) errors.first = "Required";
    if (!suLast.trim()) errors.last = "Required";
    if (!suEmail) errors.email = "Email is required";
    else if (!emailIsValid(suEmail)) errors.email = "Enter a valid email";
    if (!suPwd) errors.password = "Create a password";
    else if (suPwd.length < 8) errors.password = "Use at least 8 characters";
    if (!suTerms) errors.terms = "Please accept the terms";
    return errors;
  }

  function switchTab(nextTab: AuthTab) {
    setTab(nextTab);
    setSubmitted(false);
    setSuccess(false);
    setNotice(null);
    setCanResend(false);
    setResendState("idle");
  }

  return {
    tab,
    switchTab,
    submit,
    loading,
    success,
    redirectTo,
    notice,
    canResend,
    resendVerification,
    resendState,
    signIn: { email: siEmail, password: siPwd, remember: siRemember, errors: siErrors },
    setSignIn: { email: setSiEmail, password: setSiPwd, remember: setSiRemember },
    signUp: {
      first: suFirst,
      last: suLast,
      email: suEmail,
      password: suPwd,
      terms: suTerms,
      errors: suErrors,
      strength: scoreStrength(suPwd),
    },
    setSignUp: {
      first: setSuFirst,
      last: setSuLast,
      email: setSuEmail,
      password: setSuPwd,
      terms: setSuTerms,
    },
  };
}

export type AuthFormController = ReturnType<typeof useAuthForm>;
