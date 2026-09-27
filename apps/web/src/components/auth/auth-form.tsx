"use client";

import { IconBrandGithubFilled, IconCheck } from "@tabler/icons-react";
import { authClient, frontendCallbackURL } from "@/lib/auth-client";
import { SignInFields, SignUpFields } from "./auth-form-fields";
import { AuthShell } from "./auth-shell";
import { useAuthForm } from "./use-auth-form";

export function AuthForm({ initialTab }: { initialTab: "signin" | "signup" }) {
  const form = useAuthForm(initialTab);

  return (
    <AuthShell>
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
              ? "Pick up where your diagrams left off."
              : "Describe your system. Get a diagram you can edit."}
          </p>

          {form.notice ? (
            <div className="auth-notice" role="status">
              <p>{form.notice}</p>
              {form.canResend ? (
                <button
                  className="linklike"
                  type="button"
                  onClick={form.resendVerification}
                  disabled={form.resendState !== "idle"}
                >
                  {form.resendState === "sending"
                    ? "Sending…"
                    : form.resendState === "sent"
                      ? "Email sent"
                      : "Resend verification email"}
                </button>
              ) : null}
            </div>
          ) : null}

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

          <div className="divider">or with email</div>

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
    </AuthShell>
  );
}
