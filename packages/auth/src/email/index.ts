/**
 * Transactional email sending.
 *
 * Resend is optional. With no API key every send is a no-op instead of an error:
 * a self-hosted instance shouldn't fail signup because it has no mail provider,
 * and the quota system already degrades sensibly (an account that never receives
 * a verification mail stays on the guest allowance rather than being locked out).
 *
 * Nothing here throws into a request path. A mail provider outage must not fail a
 * signup or a password-reset request, so failures are logged and swallowed at the
 * boundary; the one exception is that `send` surfaces the error to its caller so
 * the caller decides.
 */
import { env } from "@OpenDiagram/env/server";
import { Resend } from "resend";
import { passwordResetEmail, verificationEmail, welcomeEmail, type EmailBody } from "./templates";

let cached: Resend | null | undefined;

function client(): Resend | null {
  if (cached === undefined) {
    cached = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  }
  return cached;
}

async function send(to: string, body: EmailBody, idempotencyKey?: string): Promise<void> {
  const mailer = client();
  if (!mailer) return;

  // Resend returns errors in-band rather than throwing.
  const { error } = await mailer.emails.send(
    {
      from: env.RESEND_FROM,
      to,
      subject: body.subject,
      html: body.html,
      text: body.text,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );

  if (error) throw new Error(`Resend rejected "${body.subject}": ${error.message}`);
}

/**
 * Fire-and-forget wrapper. better-auth calls these inside request handlers, and
 * a slow or failing mail provider shouldn't add latency to a signup or leak
 * timing information about whether an address exists.
 */
function sendDetached(label: string, to: string, body: EmailBody, idempotencyKey?: string): void {
  void send(to, body, idempotencyKey).catch((error) => {
    console.error(
      `[email] ${label} failed for ${to}:`,
      error instanceof Error ? error.message : error,
    );
  });
}

export function sendVerificationMail(input: {
  to: string;
  name?: string | null;
  url: string;
}): void {
  sendDetached("verification", input.to, verificationEmail(input));
}

export function sendWelcomeMail(input: {
  to: string;
  name?: string | null;
  dashboardUrl: string;
  credits: number;
}): void {
  // Verification can only succeed once per token, but a retried request could
  // reach the callback twice; the key makes a duplicate a no-op at Resend.
  sendDetached("welcome", input.to, welcomeEmail(input), `welcome/${input.to}`);
}

export function sendPasswordResetMail(input: {
  to: string;
  name?: string | null;
  url: string;
}): void {
  sendDetached("password-reset", input.to, passwordResetEmail(input));
}
