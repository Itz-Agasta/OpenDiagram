import Link from "next/link";
import { IconArrowRight, IconMail } from "@tabler/icons-react";
import { Checkbox, Field, PasswordInput } from "./auth-components";
import type { AuthFormController } from "./use-auth-form";

export function SignInFields({ form }: { form: AuthFormController }) {
  const { signIn, setSignIn } = form;
  return (
    <div className="form" data-hidden={form.tab !== "signin"}>
      <Field label="Email" htmlFor="signin-email" error={signIn.errors.email}>
        <div className="input-wrap">
          <IconMail className="input-icon" />
          <input
            className="input"
            id="signin-email"
            type="email"
            data-has-icon="true"
            value={signIn.email}
            onChange={(event) => setSignIn.email(event.target.value)}
            placeholder="you@opendiagram.dev"
            autoComplete="email"
            aria-invalid={!!signIn.errors.email || undefined}
          />
        </div>
      </Field>

      <Field label="Password" htmlFor="signin-password" error={signIn.errors.password}>
        <PasswordInput
          id="signin-password"
          value={signIn.password}
          onChange={setSignIn.password}
          placeholder="Enter your password"
          invalid={!!signIn.errors.password}
          autoComplete="current-password"
        />
      </Field>

      <Checkbox checked={signIn.remember} onChange={setSignIn.remember}>
        Keep me signed in for 30 days
      </Checkbox>
      <SubmitButton loading={form.loading}>Sign in</SubmitButton>
    </div>
  );
}

export function SignUpFields({ form }: { form: AuthFormController }) {
  const { signUp, setSignUp } = form;
  return (
    <div className="form" data-hidden={form.tab !== "signup"}>
      <div className="field-row">
        <Field label="First name" htmlFor="signup-first-name" error={signUp.errors.first}>
          <div className="input-wrap">
            <input
              className="input"
              id="signup-first-name"
              value={signUp.first}
              onChange={(event) => setSignUp.first(event.target.value)}
              placeholder="Sarah"
              autoComplete="given-name"
              aria-invalid={!!signUp.errors.first || undefined}
            />
          </div>
        </Field>
        <Field label="Last name" htmlFor="signup-last-name" error={signUp.errors.last}>
          <div className="input-wrap">
            <input
              className="input"
              id="signup-last-name"
              value={signUp.last}
              onChange={(event) => setSignUp.last(event.target.value)}
              placeholder="Chen"
              autoComplete="family-name"
              aria-invalid={!!signUp.errors.last || undefined}
            />
          </div>
        </Field>
      </div>

      <Field label="Email" htmlFor="signup-email" error={signUp.errors.email}>
        <div className="input-wrap">
          <IconMail className="input-icon" />
          <input
            className="input"
            id="signup-email"
            type="email"
            data-has-icon="true"
            value={signUp.email}
            onChange={(event) => setSignUp.email(event.target.value)}
            placeholder="you@opendiagram.dev"
            autoComplete="email"
            aria-invalid={!!signUp.errors.email || undefined}
          />
        </div>
      </Field>

      <Field
        label="Password"
        htmlFor="signup-password"
        hint={signUp.password && <span className="label-hint">{signUp.strength.label}</span>}
        error={signUp.errors.password}
      >
        <PasswordInput
          id="signup-password"
          value={signUp.password}
          onChange={setSignUp.password}
          placeholder="At least 8 characters"
          invalid={!!signUp.errors.password}
          autoComplete="new-password"
        />
        {signUp.password && (
          <div className="strength" data-level={signUp.strength.level}>
            {Array.from({ length: 4 }).map((_, index) => (
              <span key={index} className="strength-seg" />
            ))}
          </div>
        )}
      </Field>

      <Checkbox checked={signUp.terms} onChange={setSignUp.terms}>
        I agree to the <Link href="#">Terms</Link> and <Link href="#">Privacy Policy</Link>.
        {signUp.errors.terms && (
          <span style={{ color: "var(--destructive)", display: "block", marginTop: 2 }}>
            {signUp.errors.terms}
          </span>
        )}
      </Checkbox>
      <SubmitButton loading={form.loading}>Create account</SubmitButton>
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
