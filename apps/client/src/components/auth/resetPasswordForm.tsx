import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, InputGroup, SensitiveInput, Text } from "@cloudflare/kumo";
import { EnvelopeSimpleIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { authClient } from "#/lib/auth-client";

interface ResetPasswordFormProps {
  token?: string;
  urlError?: string;
}

function emailIsValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function scoreStrength(pwd: string): { level: number; label: string } {
  if (!pwd) return { level: 0, label: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const level = Math.min(4, score);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { level, label: labels[level] ?? "" };
}

export function ResetPasswordForm({ token, urlError }: ResetPasswordFormProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-kumo-base px-8 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center gap-2.5">
          <img src="/mascot.png" alt="OpenDiagram Mascot" width={32} height={32} />
          <Text bold>OpenDiagram</Text>
        </div>

        {token ? <NewPassword token={token} /> : <RequestLink urlError={urlError} />}
      </div>
    </div>
  );
}

function RequestLink({ urlError }: { urlError?: string }) {
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
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (requestError) {
        setError(requestError.message ?? "Could not send the reset link.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-kumo-success-base/10 text-kumo-success-base">
          <span className="text-2xl font-bold">✓</span>
        </div>
        <Text variant="heading2" as="h2" DANGEROUS_className="mb-2">
          Check your inbox
        </Text>
        <Text variant="secondary">
          If an account exists for {email}, a reset link is on its way. It expires in an hour.
        </Text>
      </div>
    );
  }

  return (
    <>
      <Text variant="heading2" as="h1" DANGEROUS_className="mb-2">
        Reset your <em className="not-italic text-kumo-brand">password</em>
      </Text>
      <Text variant="secondary" DANGEROUS_className="mb-8">
        We&apos;ll email you a link to choose a new one.
      </Text>

      {urlError && (
        <div
          className="mb-6 rounded-lg bg-kumo-danger/10 p-4 text-sm text-kumo-danger"
          role="alert"
        >
          That reset link has expired or was already used. Request a new one below.
        </div>
      )}

      <form onSubmit={submit} noValidate className="space-y-5">
        <InputGroup
          label="Email"
          error={error ? { message: error, match: true } : undefined}
          required
        >
          <InputGroup.Addon>
            <EnvelopeSimpleIcon size={18} />
          </InputGroup.Addon>
          <InputGroup.Input
            type="email"
            placeholder="you@opendiagram.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </InputGroup>

        <Button
          variant="primary"
          type="submit"
          className="w-full justify-center cursor-pointer"
          disabled={loading}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>Sending...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span>Send reset link</span>
              <ArrowRightIcon size={16} />
            </div>
          )}
        </Button>
      </form>

      <div className="mt-7 text-center">
        <a
          href="/login"
          className="text-sm font-medium text-kumo-default hover:text-kumo-brand underline"
        >
          Back to sign in
        </a>
      </div>
    </>
  );
}

function NewPassword({ token }: { token: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

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
      } else {
        setDone(true);
        setTimeout(() => navigate({ to: "/login" as any }), 1200);
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-kumo-success-base/10 text-kumo-success-base">
          <span className="text-2xl font-bold">✓</span>
        </div>
        <Text variant="heading2" as="h2" DANGEROUS_className="mb-2">
          Password updated
        </Text>
        <Text variant="secondary">Taking you to sign in...</Text>
      </div>
    );
  }

  return (
    <>
      <Text variant="heading2" as="h1" DANGEROUS_className="mb-2">
        Choose a new <em className="not-italic text-kumo-brand">password</em>
      </Text>
      <Text variant="secondary" DANGEROUS_className="mb-8">
        Make it something you haven&apos;t used elsewhere.
      </Text>

      <form onSubmit={submit} noValidate className="space-y-5">
        <div>
          <SensitiveInput
            label="New password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError ? { message: passwordError, match: true } : undefined}
            required
            autoComplete="new-password"
          />
          {password && (
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs text-kumo-subtle">
                <span>Password strength</span>
                <span className="font-semibold">{strength.label}</span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                      index < strength.level
                        ? strength.level === 1
                          ? "bg-red-500"
                          : strength.level === 2
                            ? "bg-orange-500"
                            : strength.level === 3
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        : "bg-zinc-200 dark:bg-zinc-800"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <SensitiveInput
          label="Confirm password"
          placeholder="Repeat the password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={confirmError ? { message: confirmError, match: true } : undefined}
          required
          autoComplete="new-password"
        />

        {formError && (
          <div className="rounded-lg bg-kumo-danger/10 p-4 text-sm text-kumo-danger" role="alert">
            {formError}
          </div>
        )}

        <Button
          variant="primary"
          type="submit"
          className="w-full justify-center cursor-pointer"
          disabled={loading}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>Updating password...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span>Update password</span>
              <ArrowRightIcon size={16} />
            </div>
          )}
        </Button>
      </form>
    </>
  );
}
