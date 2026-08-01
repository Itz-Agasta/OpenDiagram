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
 * the caller decides. Sends are awaited rather than detached -- see `sendSafely`.
 */
import { env } from "@OpenDiagram/env/server";
import { log } from "evlog";
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
 * Awaits delivery, swallowing failures.
 *
 * Awaited, not detached, because of where this runs. Cloud Run throttles an
 * instance's CPU the moment the response is written, so a promise left in flight
 * past the handler is not "sent in the background" -- it stalls until some later
 * request happens to wake the instance, or is lost outright when it recycles. That
 * silently breaks the one mail a user is actively waiting on. Every other write in
 * this codebase completes before its response for the same reason.
 *
 * The cost is latency, and on the reset path a timing signal about whether an
 * address exists (better-auth only invokes the callback for a real account). A few
 * hundred milliseconds of provider latency is a weak oracle next to a password
 * reset that never arrives.
 *
 * Failures are logged and swallowed: a mail outage must not fail the signup or
 * reset request itself, and the quota resolver already degrades sensibly when a
 * verification mail never lands.
 */
async function sendSafely(
  label: string,
  to: string,
  body: EmailBody,
  idempotencyKey?: string,
): Promise<void> {
  try {
    await send(to, body, idempotencyKey);
  } catch (error) {
    log.error({
      action: "email.send_failed",
      email: { kind: label },
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function sendVerificationMail(input: {
  to: string;
  name?: string | null;
  url: string;
}): Promise<void> {
  await sendSafely("verification", input.to, verificationEmail(input));
}

export async function sendWelcomeMail(input: {
  to: string;
  name?: string | null;
  dashboardUrl: string;
  credits: number;
}): Promise<void> {
  // Verification can only succeed once per token, but a retried request could
  // reach the callback twice; the key makes a duplicate a no-op at Resend.
  await sendSafely("welcome", input.to, welcomeEmail(input), `welcome/${input.to}`);
}

export async function sendPasswordResetMail(input: {
  to: string;
  name?: string | null;
  url: string;
}): Promise<void> {
  await sendSafely("password-reset", input.to, passwordResetEmail(input));
}
