import { env } from "@OpenDiagram/env/server";
import { log } from "evlog";
import { Resend } from "resend";
import {
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
  welcomeEmail,
  type EmailBody,
} from "./templates";

// Well above a normal send (~1.2s measured) and short enough that a stalled
// socket fails the mail instead of the signup or reset request carrying it.
const SEND_TIMEOUT_MS = 10_000;

type SendOptions = Parameters<Resend["emails"]["send"]>[1];

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

  // Resend returns errors in-band rather than throwing, an aborted fetch included.
  // resend 6.18.1 gives fetch() no deadline, so one stalled socket held a password
  // reset open for 271s. Its options are spread into the fetch init, so a signal
  // works at runtime, but the types leave it out; hence the cast. A Promise.race
  // would stop waiting without closing the socket.
  // https://github.com/resend/resend-node/discussions/958
  const { error } = await mailer.emails.send(
    {
      from: env.RESEND_FROM,
      to,
      subject: body.subject,
      html: body.html,
      text: body.text,
    },
    {
      ...(idempotencyKey ? { idempotencyKey } : {}),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    } as SendOptions,
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
  site: string;
}): Promise<void> {
  await sendSafely("verification", input.to, verificationEmail(input));
}

export async function sendWelcomeMail(input: {
  to: string;
  name?: string | null;
  dashboardUrl: string;
  credits: number;
  site: string;
}): Promise<void> {
  // Verification can only succeed once per token, but a retried request could
  // reach the callback twice; the key makes a duplicate a no-op at Resend.
  await sendSafely("welcome", input.to, welcomeEmail(input), `welcome/${input.to}`);
}

export async function sendPasswordResetMail(input: {
  to: string;
  name?: string | null;
  url: string;
  site: string;
}): Promise<void> {
  await sendSafely("password-reset", input.to, passwordResetEmail(input));
}

export async function sendPasswordChangedMail(input: {
  to: string;
  name?: string | null;
  site: string;
}): Promise<void> {
  await sendSafely("password-changed", input.to, passwordChangedEmail(input));
}
