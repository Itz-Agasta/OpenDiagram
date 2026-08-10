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
  if (!mailer) {
    console.log("==================================================");
    console.log(`[DEVELOPMENT ONLY] Mock Email Sent To: ${to}`);
    console.log(`Subject: ${body.subject}`);
    const urlMatch = body.text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      console.log(`Link: ${urlMatch[0]}`);
    } else {
      console.log(`Text: ${body.text}`);
    }
    console.log("==================================================");
    return;
  }

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
 * Awaits delivery, swallowing failures. Cloud Run throttles CPU after the
 * response is written, so a detached promise stalls or is lost on recycle.
 * Failures are logged: a mail outage must not fail the signup/reset request.
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
