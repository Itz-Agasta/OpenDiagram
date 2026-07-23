"use client";

import { IconBrandGithubFilled, IconCheck } from "@tabler/icons-react";
import { authClient, frontendCallbackURL } from "@/lib/auth-client";
import { VisualPane } from "./auth-components";
import { SignInFields, SignUpFields } from "./auth-form-fields";
import { useAuthForm } from "./use-auth-form";

export function AuthForm({ initialTab }: { initialTab: "signin" | "signup" }) {
  const form = useAuthForm(initialTab);

  return (
    <div className="stage" data-layout="split" data-accent="lime">
      <div className="pane-form">
        <div className="auth-card">
          <div className="brand">
            <div className="brand-mark">O</div>
            <div className="brand-name">OpenDiagram</div>
          </div>

          {form.success ? (
            <div className="success">
              <div className="success-icon">
                <IconCheck width={28} height={28} />
              </div>
              <h2>{form.tab === "signin" ? "Welcome back" : "You're in"}</h2>
              <p>Redirecting to your workspace…</p>
            </div>
          ) : (
            <>
              <h1 className="title">
                {form.tab === "signin" ? (
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
                {form.tab === "signin"
                  ? "Sign in to continue exploring the archive."
                  : "Start charting your own diagrams in minutes."}
              </p>

              <div className="tabs" role="tablist">
                <div className="tab-pill" data-pos={form.tab} />
                {(["signin", "signup"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className="tab"
                    data-active={form.tab === tab}
                    onClick={() => form.switchTab(tab)}
                    role="tab"
                    aria-selected={form.tab === tab}
                  >
                    {tab === "signin" ? "Sign in" : "Sign up"}
                  </button>
                ))}
              </div>

              <form onSubmit={form.submit} noValidate>
                <div className="forms">
                  <SignInFields form={form} />
                  <SignUpFields form={form} />
                </div>
              </form>

              <div className="divider">or continue with</div>
              <button
                className="btn btn-github"
                type="button"
                onClick={() =>
                  authClient.signIn.social({
                    provider: "github",
                    callbackURL: frontendCallbackURL(form.redirectTo),
                    errorCallbackURL: frontendCallbackURL(
                      `/login?redirect=${encodeURIComponent(form.redirectTo)}`,
                    ),
                  })
                }
              >
                <IconBrandGithubFilled size={16} />
                Continue with GitHub
              </button>

              <div className="alt">
                {form.tab === "signin" ? "New here? " : "Already a member? "}
                <button
                  className="linklike"
                  type="button"
                  onClick={() => form.switchTab(form.tab === "signin" ? "signup" : "signin")}
                >
                  {form.tab === "signin" ? "Create an account" : "Sign in"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <VisualPane _isSignup={form.tab === "signup"} />
    </div>
  );
}
