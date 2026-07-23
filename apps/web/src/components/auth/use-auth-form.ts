"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient, safeFrontendPath } from "@/lib/auth-client";
import { scoreStrength } from "./auth-components";

export type AuthTab = "signin" | "signup";

function emailIsValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  }

  return {
    tab,
    switchTab,
    submit,
    loading,
    success,
    redirectTo,
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
