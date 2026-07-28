"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconArrowRight, IconCheck, IconMail } from "@tabler/icons-react";
import { authClient } from "@/lib/auth-client";
import { Field, PasswordInput, scoreStrength } from "./auth-components";

/**
 * Both halves of password recovery on one route.
 *
 * better-auth mails a link to its *own* `/reset-password/<token>` endpoint, which
 * validates the token and then redirects to the `redirectTo` we pass, appending
 * either `?token=` or `?error=INVALID_TOKEN`. So this page is the request form when
 * it has no token and the new-password form when it does -- one route to register as
 * `redirectTo`, and no way to land on half a flow.
 */
export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");

  return (
    <div className="stage" data-layout="single" data-accent="lime">
      <div className="pane-form">
        <div className="auth-card">
          <div className="brand">
            <div className="brand-mark">O</div>
            <div className="brand-name">OpenDiagram</div>
          </div>
          {token ? <NewPassword token={token} /> : <RequestLink linkError={linkError} />}
        </div>
      </div>
    </div>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: string }) {
  return (
    <button className="btn" type="submit" data-loading={loading} disabled={loading}>
      <span className="btn-spin" />
      <span className="btn-label">
        <span className="btn-label-row">{children}</span>
        <IconArrowRight width={16} height={16} />
      </span>
    </button>
  );
}

function emailIsValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function RequestLink({ linkError }: { linkError: string | null }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!emailIsValid(email)) {
      setError("Enter a valid email");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: requestError } = await authClient.requestPasswordReset({
        email,
        // Absolute, and back to this same page: better-auth builds the mailed link
        // against the API origin, so a relative path would land the user on the bare
        // API host.
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Shown whether or not the address exists -- the response is the same either
      // way, and saying "no such account" would turn this into a user enumerator.
      if (requestError) setError(requestError.message ?? "Could not send the reset link.");
      else setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      // In `finally` so a rejected request can't leave the button spinning forever.
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="success">
        <div className="success-icon">
          <IconCheck width={28} height={28} />
        </div>
        <h2>Check your inbox</h2>
        <p>If an account exists for {email}, a reset link is on its way. It expires in an hour.</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="title">
        Reset your <em>password</em>
      </h1>
      <p className="subtitle">We&apos;ll email you a link to choose a new one.</p>

      {linkError && (
        <p className="field-error" role="alert">
          That reset link has expired or was already used. Request a new one below.
        </p>
      )}

      <form onSubmit={submit} noValidate>
        <div className="form">
          <Field label="Email" htmlFor="reset-email" error={error ?? undefined}>
            <div className="input-wrap">
              <IconMail className="input-icon" />
              <input
                className="input"
                id="reset-email"
                type="email"
                data-has-icon="true"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@opendiagram.dev"
                autoComplete="email"
                aria-invalid={!!error || undefined}
              />
            </div>
          </Field>
          <SubmitButton loading={loading}>Send reset link</SubmitButton>
        </div>
      </form>

      <div className="alt">
        Remembered it? <Link href="/login">Back to sign in</Link>
      </div>
    </>
  );
}

function NewPassword({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Kept apart so each message renders against the field it is about. Routing all
  // three through one slot marked Confirm password as invalid for a weak *new*
  // password, and for a server failure that is neither field's fault.
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const strength = scoreStrength(password);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const tooShort = password.length < 8 ? "Use at least 8 characters" : null;
    const mismatch = password !== confirm ? "Passwords don't match" : null;
    setPasswordError(tooShort);
    setConfirmError(mismatch);
    setFormError(null);
    if (tooShort || mismatch) return;

    setLoading(true);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        setFormError(resetError.message ?? "Could not reset your password.");
        return;
      }
      setDone(true);
      // Resetting does not sign the user in, so send them to sign in with the new
      // password rather than to a dashboard that would bounce them back.
      setTimeout(() => router.push("/login"), 1200);
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      // In `finally` so a rejected request can't leave the button spinning forever.
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="success">
        <div className="success-icon">
          <IconCheck width={28} height={28} />
        </div>
        <h2>Password updated</h2>
        <p>Taking you to sign in…</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="title">
        Choose a new <em>password</em>
      </h1>
      <p className="subtitle">Make it something you haven&apos;t used elsewhere.</p>

      <form onSubmit={submit} noValidate>
        <div className="form">
          <Field
            label="New password"
            htmlFor="reset-password"
            hint={password && <span className="label-hint">{strength.label}</span>}
            error={passwordError ?? undefined}
          >
            <PasswordInput
              id="reset-password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              invalid={!!passwordError}
              autoComplete="new-password"
            />
            {password && (
              <div className="strength" data-level={strength.level}>
                {Array.from({ length: 4 }).map((_, index) => (
                  <span key={index} className="strength-seg" />
                ))}
              </div>
            )}
          </Field>

          <Field label="Confirm password" htmlFor="reset-confirm" error={confirmError ?? undefined}>
            <PasswordInput
              id="reset-confirm"
              value={confirm}
              onChange={setConfirm}
              placeholder="Repeat the password"
              invalid={!!confirmError}
              autoComplete="new-password"
            />
          </Field>

          {formError && (
            <p className="field-error" role="alert">
              {formError}
            </p>
          )}

          <SubmitButton loading={loading}>Update password</SubmitButton>
        </div>
      </form>
    </>
  );
}
