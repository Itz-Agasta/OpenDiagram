"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient, frontendCallbackURL } from "@/lib/auth-client";
import { IconMail, IconCheck, IconArrowRight, IconBrandGithubFilled } from "@tabler/icons-react";
import { Field, PasswordInput, scoreStrength, VisualPane, Checkbox } from "./auth-components";

function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/dashboard";
  }
  return raw;
}

export function AuthForm({ initialTab }: { initialTab: "signin" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  const [tab, setTab] = useState<"signin" | "signup">(initialTab);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;
    if (session?.user) {
      router.replace(redirectTo);
    }
  }, [isPending, redirectTo, router, session]);

  // Sign-in fields
  const [siEmail, setSiEmail] = useState("");
  const [siPwd, setSiPwd] = useState("");
  const [siRemember, setSiRemember] = useState(true);

  // Sign-up fields
  const [suFirst, setSuFirst] = useState("");
  const [suLast, setSuLast] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPwd, setSuPwd] = useState("");
  const [suTerms, setSuTerms] = useState(false);

  const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const siErrors = useMemo(() => {
    if (!submitted) return {} as Record<string, string>;
    const e = {} as Record<string, string>;
    if (!siEmail) e.email = "Email is required";
    else if (!emailOk(siEmail)) e.email = "Enter a valid email";
    if (!siPwd) e.password = "Password is required";
    return e;
  }, [submitted, siEmail, siPwd]);

  const suErrors = useMemo(() => {
    if (!submitted) return {} as Record<string, string>;
    const e = {} as Record<string, string>;
    if (!suFirst.trim()) e.first = "Required";
    if (!suLast.trim()) e.last = "Required";
    if (!suEmail) e.email = "Email is required";
    else if (!emailOk(suEmail)) e.email = "Enter a valid email";
    if (!suPwd) e.password = "Create a password";
    else if (suPwd.length < 8) e.password = "Use at least 8 characters";
    if (!suTerms) e.terms = "Please accept the terms";
    return e;
  }, [submitted, suFirst, suLast, suEmail, suPwd, suTerms]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const liveErrs = (() => {
      if (tab === "signin") {
        const o = {} as Record<string, string>;
        if (!siEmail) o.email = "Email is required";
        else if (!emailOk(siEmail)) o.email = "Enter a valid email";
        if (!siPwd) o.password = "Password is required";
        return o;
      }
      const o = {} as Record<string, string>;
      if (!suFirst.trim()) o.first = "Required";
      if (!suLast.trim()) o.last = "Required";
      if (!suEmail) o.email = "Email is required";
      else if (!emailOk(suEmail)) o.email = "Enter a valid email";
      if (!suPwd) o.password = "Create a password";
      else if (suPwd.length < 8) o.password = "Use at least 8 characters";
      if (!suTerms) o.terms = "Please accept the terms";
      return o;
    })();

    if (Object.keys(liveErrs).length > 0) return;
    setLoading(true);

    try {
      if (tab === "signin") {
        await authClient.signIn.email(
          { email: siEmail, password: siPwd, rememberMe: siRemember },
          {
            onRequest: () => setLoading(true),
            onSuccess: () => {
              setSuccess(true);
              setTimeout(() => {
                router.push(redirectTo);
                router.refresh();
              }, 500);
            },
            onError: (ctx) => {
              setLoading(false);
              alert(ctx.error.message || "Invalid email or password");
            },
          },
        );
      } else {
        await authClient.signUp.email(
          { email: suEmail, password: suPwd, name: `${suFirst} ${suLast}`.trim() },
          {
            onRequest: () => setLoading(true),
            onSuccess: () => {
              setSuccess(true);
              setTimeout(() => {
                router.push(redirectTo);
                router.refresh();
              }, 500);
            },
            onError: (ctx) => {
              setLoading(false);
              alert(ctx.error.message || "Failed to create account");
            },
          },
        );
      }
    } catch {
      setLoading(false);
      alert("Something went wrong. Please try again.");
    }
  };

  const switchTab = (t: "signin" | "signup") => {
    setTab(t);
    setSubmitted(false);
    setSuccess(false);
  };

  const strength = scoreStrength(suPwd);

  return (
    <div className="stage" data-layout="split" data-accent="lime">
      <div className="pane-form">
        <div className="auth-card">
          <div className="brand">
            <div className="brand-mark">O</div>
            <div className="brand-name">OpenDiagram</div>
          </div>

          {success ? (
            <div className="success">
              <div className="success-icon">
                <IconCheck width={28} height={28} />
              </div>
              <h2>{tab === "signin" ? "Welcome back" : "You're in"}</h2>
              <p>Redirecting to your workspace…</p>
            </div>
          ) : (
            <>
              <h1 className="title">
                {tab === "signin" ? (
                  <>
                    Welcome <em>back</em>
                  </>
                ) : (
                  <>
                    Create <em>your</em> account
                  </>
                )}
              </h1>
              <p className="subtitle">
                {tab === "signin"
                  ? "Sign in to continue exploring the archive."
                  : "Start charting your own diagrams in minutes."}
              </p>

              <div className="tabs" role="tablist">
                <div className="tab-pill" data-pos={tab === "signin" ? "signin" : "signup"} />
                <button
                  type="button"
                  className="tab"
                  data-active={tab === "signin"}
                  onClick={() => switchTab("signin")}
                  role="tab"
                  aria-selected={tab === "signin"}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className="tab"
                  data-active={tab === "signup"}
                  onClick={() => switchTab("signup")}
                  role="tab"
                  aria-selected={tab === "signup"}
                >
                  Sign up
                </button>
              </div>

              <form onSubmit={submit} noValidate>
                <div className="forms">
                  {/* SIGN IN */}
                  <div className="form" data-hidden={tab !== "signin"}>
                    <Field label="Email" error={siErrors.email}>
                      <div className="input-wrap">
                        <IconMail className="input-icon" />
                        <input
                          className="input"
                          type="email"
                          data-has-icon="true"
                          value={siEmail}
                          onChange={(e) => setSiEmail(e.target.value)}
                          placeholder="you@opendiagram.dev"
                          autoComplete="email"
                          aria-invalid={!!siErrors.email || undefined}
                        />
                      </div>
                    </Field>

                    <Field label="Password" error={siErrors.password}>
                      <PasswordInput
                        value={siPwd}
                        onChange={setSiPwd}
                        placeholder="Enter your password"
                        invalid={!!siErrors.password}
                        autoComplete="current-password"
                      />
                    </Field>

                    <Checkbox checked={siRemember} onChange={setSiRemember}>
                      Keep me signed in for 30 days
                    </Checkbox>

                    <button className="btn" type="submit" data-loading={loading} disabled={loading}>
                      <span className="btn-spin" />
                      <span className="btn-label">
                        <span className="btn-label-row">Sign in</span>
                        <IconArrowRight width={16} height={16} />
                      </span>
                    </button>
                  </div>

                  {/* SIGN UP */}
                  <div className="form" data-hidden={tab !== "signup"}>
                    <div className="field-row">
                      <Field label="First name" error={suErrors.first}>
                        <div className="input-wrap">
                          <input
                            className="input"
                            value={suFirst}
                            onChange={(e) => setSuFirst(e.target.value)}
                            placeholder="Sarah"
                            autoComplete="given-name"
                            aria-invalid={!!suErrors.first || undefined}
                          />
                        </div>
                      </Field>
                      <Field label="Last name" error={suErrors.last}>
                        <div className="input-wrap">
                          <input
                            className="input"
                            value={suLast}
                            onChange={(e) => setSuLast(e.target.value)}
                            placeholder="Chen"
                            autoComplete="family-name"
                            aria-invalid={!!suErrors.last || undefined}
                          />
                        </div>
                      </Field>
                    </div>

                    <Field label="Email" error={suErrors.email}>
                      <div className="input-wrap">
                        <IconMail className="input-icon" />
                        <input
                          className="input"
                          type="email"
                          data-has-icon="true"
                          value={suEmail}
                          onChange={(e) => setSuEmail(e.target.value)}
                          placeholder="you@opendiagram.dev"
                          autoComplete="email"
                          aria-invalid={!!suErrors.email || undefined}
                        />
                      </div>
                    </Field>

                    <Field
                      label="Password"
                      hint={suPwd && <span className="label-hint">{strength.label}</span>}
                      error={suErrors.password}
                    >
                      <PasswordInput
                        value={suPwd}
                        onChange={setSuPwd}
                        placeholder="At least 8 characters"
                        invalid={!!suErrors.password}
                        autoComplete="new-password"
                      />
                      {suPwd && (
                        <div className="strength" data-level={strength.level}>
                          <span className="strength-seg" />
                          <span className="strength-seg" />
                          <span className="strength-seg" />
                          <span className="strength-seg" />
                        </div>
                      )}
                    </Field>

                    <Checkbox checked={suTerms} onChange={setSuTerms}>
                      I agree to the <Link href="#">Terms</Link> and{" "}
                      <Link href="#">Privacy Policy</Link>.
                      {suErrors.terms && (
                        <span
                          style={{ color: "var(--destructive)", display: "block", marginTop: 2 }}
                        >
                          {suErrors.terms}
                        </span>
                      )}
                    </Checkbox>

                    <button className="btn" type="submit" data-loading={loading} disabled={loading}>
                      <span className="btn-spin" />
                      <span className="btn-label">
                        <span className="btn-label-row">Create account</span>
                        <IconArrowRight width={16} height={16} />
                      </span>
                    </button>
                  </div>
                </div>
              </form>

              <div className="divider">or continue with</div>
              <button
                className="btn btn-github"
                type="button"
                onClick={() =>
                  authClient.signIn.social({
                    provider: "github",
                    callbackURL: frontendCallbackURL(redirectTo),
                    errorCallbackURL: frontendCallbackURL(
                      `/login?redirect=${encodeURIComponent(redirectTo)}`,
                    ),
                  })
                }
              >
                <IconBrandGithubFilled size={16} />
                Continue with GitHub
              </button>

              <div className="alt">
                {tab === "signin" ? (
                  <>
                    New here?{" "}
                    <button className="linklike" type="button" onClick={() => switchTab("signup")}>
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already a member?{" "}
                    <button className="linklike" type="button" onClick={() => switchTab("signin")}>
                      Sign in
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <VisualPane _isSignup={tab === "signup"} />
    </div>
  );
}
