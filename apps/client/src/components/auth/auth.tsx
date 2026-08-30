import { useState, useEffect, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  InputGroup,
  SensitiveInput,
  Tabs,
  Text,
  Checkbox,
  useKumoToastManager,
} from "@cloudflare/kumo";
import { EnvelopeSimpleIcon, GithubLogoIcon, ArrowRightIcon } from "@phosphor-icons/react";
import { authClient, frontendCallbackURL, safeFrontendPath } from "#/lib/api";

interface SignUpPageProps {
  initialTab?: "signin" | "signup";
  redirect?: string;
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

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  account_not_linked:
    "An account already exists for that email, but it isn't linked to GitHub yet. Sign in with your password.",
  unable_to_link_account:
    "We couldn't link that GitHub account. Try signing in with your password.",
  "email_doesn't_match": "That GitHub account uses a different email than the one on file.",
  account_already_linked_to_different_user:
    "That GitHub account is already linked to a different OpenDiagram account.",
  email_not_found:
    "GitHub didn't share an email address. Add a public email to your GitHub account, or sign in with a password.",
};

export default function SignUpPage({ initialTab = "signup", redirect, urlError }: SignUpPageProps) {
  const navigate = useNavigate();
  const redirectTo = safeFrontendPath(redirect);
  const toastManager = useKumoToastManager();

  const [mode, setMode] = useState<"signin" | "signup">(initialTab);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Sign In States
  const [siEmail, setSiEmail] = useState("");
  const [siPwd, setSiPwd] = useState("");
  const [siRemember, setSiRemember] = useState(true);

  // Sign Up States
  const [suFirst, setSuFirst] = useState("");
  const [suLast, setSuLast] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPwd, setSuPwd] = useState("");
  const [suTerms, setSuTerms] = useState(false);
  // Verification States
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [checkLoading, setCheckLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: session, isPending } = authClient.useSession();

  // Redirect if session is active
  useEffect(() => {
    if (!isPending && session?.user) {
      if (isVerifyingEmail) return;
      navigate({ to: redirectTo as any, replace: true });
    }
  }, [isPending, redirectTo, navigate, session, isVerifyingEmail]);

  // Display OAuth error if present
  useEffect(() => {
    if (urlError) {
      toastManager.add({
        title: "Authentication Failed",
        description:
          OAUTH_ERROR_MESSAGES[urlError] ||
          "Social sign-in failed. Try signing in with a password.",
        variant: "error",
      });
    }
  }, [urlError, toastManager]);

  // Validation logic
  const siErrors: Record<string, string> = {};
  if (submitted) {
    if (!siEmail) siErrors.email = "Email is required";
    else if (!emailIsValid(siEmail)) siErrors.email = "Enter a valid email";
    if (!siPwd) siErrors.password = "Password is required";
  }

  const suErrors: Record<string, string> = {};
  if (submitted) {
    if (!suFirst.trim()) suErrors.first = "Required";
    if (!suLast.trim()) suErrors.last = "Required";
    if (!suEmail) suErrors.email = "Email is required";
    else if (!emailIsValid(suEmail)) suErrors.email = "Enter a valid email";
    if (!suPwd) suErrors.password = "Create a password";
    else if (suPwd.length < 8) suErrors.password = "Use at least 8 characters";
    if (!suTerms) suErrors.terms = "Please accept the terms";
  }

  // Strength score
  const pwdStrength = scoreStrength(suPwd);

  function finishAuthentication() {
    setSuccess(true);
    setTimeout(() => {
      navigate({ to: redirectTo as any });
    }, 500);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const errors = mode === "signin" ? siErrors : suErrors;
    if (Object.keys(errors).length > 0) return;
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await authClient.signIn.email({
          email: siEmail,
          password: siPwd,
          rememberMe: siRemember,
        });
        if (error) {
          setLoading(false);
          toastManager.add({
            title: "Sign In Failed",
            description: error.message || "Invalid email or password.",
            variant: "error",
          });
        } else {
          finishAuthentication();
        }
      } else {
        const { error } = await authClient.signUp.email({
          email: suEmail,
          password: suPwd,
          name: `${suFirst} ${suLast}`.trim(),
          callbackURL: window.location.origin + "/app",
        });
        if (error) {
          setLoading(false);
          toastManager.add({
            title: "Sign Up Failed",
            description: error.message || "Failed to create account.",
            variant: "error",
          });
        } else {
          setRegisteredEmail(suEmail);
          setLoading(false);
          setIsVerifyingEmail(true);
        }
      }
    } catch {
      setLoading(false);
      toastManager.add({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "error",
      });
    }
  }
  async function checkVerificationStatus() {
    setCheckLoading(true);
    try {
      const { data, error } = await authClient.getSession();
      if (error) throw new Error(error.message ?? "Failed to fetch session.");

      if (data?.user?.emailVerified) {
        toastManager.add({
          title: "Email verified",
          description: "Your email has been verified successfully. Welcome to OpenDiagram!",
          variant: "success",
        });
        await queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
        navigate({ to: redirectTo as any });
      } else {
        toastManager.add({
          title: "Not verified yet",
          description:
            "We couldn't verify your email yet. Please check your inbox and click the verification link.",
          variant: "warning",
        });
      }
    } catch (err: unknown) {
      toastManager.add({
        title: "Error checking status",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "error",
      });
    } finally {
      setCheckLoading(false);
    }
  }

  async function resendVerification() {
    if (!registeredEmail) return;
    setResendLoading(true);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: registeredEmail,
        callbackURL: window.location.origin + "/app",
      });
      if (error) throw new Error(error.message ?? "Failed to send email.");
      toastManager.add({
        title: "Verification email sent",
        description: "Please check your inbox (and spam folder) for the verification link.",
        variant: "success",
      });
    } catch (err: unknown) {
      toastManager.add({
        title: "Failed to send email",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "error",
      });
    } finally {
      setResendLoading(false);
    }
  }

  async function skipVerification() {
    await queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
    navigate({ to: redirectTo as any });
  }

  function switchTab(nextTab: "signin" | "signup") {
    const update = () => {
      flushSync(() => {
        setMode(nextTab);
        setSubmitted(false);
        setSuccess(false);
      });
    };

    const doc = document as any;
    if (doc.startViewTransition) {
      doc.startViewTransition(update);
    } else {
      update();
    }
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* Left: form panel */}
      <div className="flex w-full items-center justify-center bg-kumo-base px-8 py-12 lg:w-[44%]">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 flex items-center gap-2.5">
            <img src="/mascot.png" alt="OpenDiagram Mascot" width={32} height={32} />
            <Text bold>OpenDiagram</Text>
          </div>

          {isVerifyingEmail ? (
            <div className="flex flex-col gap-6 font-geist">
              <div>
                <Text variant="heading2" as="h1" DANGEROUS_className="mb-2">
                  Verify your email
                </Text>
                <Text variant="secondary" DANGEROUS_className="leading-relaxed">
                  We sent a verification link to{" "}
                  <span className="font-semibold text-gray-900">{registeredEmail}</span>. Please
                  click the link in your email to verify your account and unlock your full 25
                  credits.
                </Text>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  variant="primary"
                  type="button"
                  className="w-full justify-center cursor-pointer h-10 text-sm font-semibold rounded-xl"
                  onClick={checkVerificationStatus}
                  disabled={checkLoading}
                >
                  {checkLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>Checking...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>Check Verification Status</span>
                      <ArrowRightIcon size={16} />
                    </div>
                  )}
                </Button>

                <Button
                  variant="secondary"
                  type="button"
                  className="w-full justify-center cursor-pointer h-10 text-sm font-semibold rounded-xl"
                  onClick={resendVerification}
                  disabled={resendLoading}
                >
                  {resendLoading ? "Resending..." : "Resend Verification Link"}
                </Button>

                <button
                  type="button"
                  onClick={skipVerification}
                  className="mt-3 text-center text-xs font-semibold text-gray-500 hover:text-gray-900 underline underline-offset-4 cursor-pointer"
                >
                  Skip to Dashboard (Unverified)
                </button>
              </div>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-kumo-success-base/10 text-kumo-success-base">
                <span className="text-2xl font-bold">✓</span>
              </div>
              <Text variant="heading2" as="h2" DANGEROUS_className="mb-2">
                {mode === "signin" ? "Welcome back" : "You're in"}
              </Text>
              <Text variant="secondary">Redirecting to your workspace...</Text>
            </div>
          ) : (
            <>
              <Text variant="heading2" as="h1" DANGEROUS_className="mb-2">
                {mode === "signup" ? (
                  <>
                    Create <em className="not-italic text-kumo-brand">your</em> account
                  </>
                ) : (
                  <>
                    Welcome <em className="not-italic text-kumo-brand">back</em>
                  </>
                )}
              </Text>
              <Text variant="secondary" DANGEROUS_className="mb-8">
                {mode === "signup"
                  ? "Start charting your own diagrams in minutes."
                  : "Sign in to continue exploring the archive."}
              </Text>

              <Tabs
                variant="segmented"
                className="mb-7 w-full"
                listClassName="w-full flex"
                tabs={[
                  { value: "signin", label: "Sign in", className: "flex-1 justify-center" },
                  { value: "signup", label: "Sign up", className: "flex-1 justify-center" },
                ]}
                selectedValue={mode}
                onValueChange={(v) => switchTab(v as "signin" | "signup")}
              />

              <form className="space-y-5" onSubmit={submit} noValidate>
                {mode === "signin" ? (
                  <>
                    <InputGroup
                      label="Email"
                      error={siErrors.email ? { message: siErrors.email, match: true } : undefined}
                      required
                    >
                      <InputGroup.Addon>
                        <EnvelopeSimpleIcon size={18} />
                      </InputGroup.Addon>
                      <InputGroup.Input
                        type="email"
                        placeholder="you@opendiagram.dev"
                        value={siEmail}
                        onChange={(e) => setSiEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </InputGroup>

                    <SensitiveInput
                      label="Password"
                      placeholder="Enter your password"
                      value={siPwd}
                      onChange={(e) => setSiPwd(e.target.value)}
                      error={
                        siErrors.password ? { message: siErrors.password, match: true } : undefined
                      }
                      required
                      autoComplete="current-password"
                    />

                    <div className="flex items-center justify-between">
                      <Checkbox
                        checked={siRemember}
                        onCheckedChange={setSiRemember}
                        label="Keep me signed in for 30 days"
                      />
                      <a
                        href="/reset-password"
                        className="text-sm font-medium text-kumo-default hover:text-kumo-brand underline"
                      >
                        Forgot password?
                      </a>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-4">
                      <div className="flex-grow flex-1">
                        <Input
                          label="First name"
                          placeholder="Sarah"
                          value={suFirst}
                          onChange={(e) => setSuFirst(e.target.value)}
                          error={
                            suErrors.first ? { message: suErrors.first, match: true } : undefined
                          }
                          required
                          autoComplete="given-name"
                        />
                      </div>
                      <div className="flex-grow flex-1">
                        <Input
                          label="Last name"
                          placeholder="Chen"
                          value={suLast}
                          onChange={(e) => setSuLast(e.target.value)}
                          error={
                            suErrors.last ? { message: suErrors.last, match: true } : undefined
                          }
                          required
                          autoComplete="family-name"
                        />
                      </div>
                    </div>

                    <InputGroup
                      label="Email"
                      error={suErrors.email ? { message: suErrors.email, match: true } : undefined}
                      required
                    >
                      <InputGroup.Addon>
                        <EnvelopeSimpleIcon size={18} />
                      </InputGroup.Addon>
                      <InputGroup.Input
                        type="email"
                        placeholder="you@opendiagram.dev"
                        value={suEmail}
                        onChange={(e) => setSuEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </InputGroup>

                    <div>
                      <SensitiveInput
                        label="Password"
                        placeholder="At least 8 characters"
                        value={suPwd}
                        onChange={(e) => setSuPwd(e.target.value)}
                        error={
                          suErrors.password
                            ? { message: suErrors.password, match: true }
                            : undefined
                        }
                        required
                        autoComplete="new-password"
                      />
                      {suPwd && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-xs text-kumo-subtle">
                            <span>Password strength</span>
                            <span className="font-semibold">{pwdStrength.label}</span>
                          </div>
                          <div className="flex gap-1">
                            {Array.from({ length: 4 }).map((_, index) => (
                              <div
                                key={index}
                                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                  index < pwdStrength.level
                                    ? pwdStrength.level === 1
                                      ? "bg-red-500"
                                      : pwdStrength.level === 2
                                        ? "bg-orange-500"
                                        : pwdStrength.level === 3
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

                    <div>
                      <Checkbox
                        checked={suTerms}
                        onCheckedChange={setSuTerms}
                        label={
                          <span className="text-sm">
                            I agree to the{" "}
                            <a
                              href="#"
                              className="underline text-kumo-default hover:text-kumo-brand"
                            >
                              Terms
                            </a>{" "}
                            and{" "}
                            <a
                              href="#"
                              className="underline text-kumo-default hover:text-kumo-brand"
                            >
                              Privacy Policy
                            </a>
                            .
                          </span>
                        }
                      />
                      {suErrors.terms && (
                        <span className="mt-1 block text-sm text-kumo-danger">
                          {suErrors.terms}
                        </span>
                      )}
                    </div>
                  </>
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
                      <span>{mode === "signin" ? "Signing in..." : "Creating account..."}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>{mode === "signin" ? "Sign in" : "Create account"}</span>
                      <ArrowRightIcon size={16} />
                    </div>
                  )}
                </Button>
              </form>

              <div className="my-7 flex items-center gap-3">
                <div className="h-px flex-1 bg-kumo-hairline" />
                <Text
                  size="xs"
                  variant="secondary"
                  DANGEROUS_className="tracking-wide uppercase font-semibold"
                >
                  or continue with
                </Text>
                <div className="h-px flex-1 bg-kumo-hairline" />
              </div>

              <Button
                variant="secondary"
                className="w-full justify-center cursor-pointer"
                onClick={() => {
                  setLoading(true);
                  authClient.signIn.social({
                    provider: "github",
                    callbackURL: frontendCallbackURL(redirectTo),
                    errorCallbackURL: frontendCallbackURL(
                      `/login?redirect=${encodeURIComponent(redirectTo)}`,
                    ),
                  });
                }}
                disabled={loading}
              >
                <div className="flex items-center justify-center gap-2">
                  <GithubLogoIcon size={18} />
                  <span>Continue with GitHub</span>
                </div>
              </Button>

              <div className="mt-7 text-center">
                <Text size="sm" color="subtle">
                  {mode === "signin" ? "New here? " : "Already a member? "}
                  <button
                    type="button"
                    onClick={() => switchTab(mode === "signin" ? "signup" : "signin")}
                    className="font-medium underline text-kumo-default hover:text-kumo-brand cursor-pointer"
                  >
                    {mode === "signin" ? "Create an account" : "Sign in"}
                  </button>
                </Text>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: visual panel */}
      <div className="relative hidden w-[56%] items-end overflow-hidden bg-kumo-inverse-base p-10 lg:flex">
        <img
          src="/auth/flower.jpg"
          alt="Annotated flower architecture study"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="relative z-10 flex flex-col gap-2">
          <span className="inline-block w-fit rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold tracking-wider text-white backdrop-blur-xs">
            VIBE DIAGRAMS
          </span>
          <p className="max-w-[420px] text-2xl font-medium text-white leading-snug">
            {mode === "signup"
              ? "Architect systems visually, generate instantly."
              : "Make Vibe Diagrams for your Vibe Projects."}
          </p>
        </div>
      </div>
    </div>
  );
}
