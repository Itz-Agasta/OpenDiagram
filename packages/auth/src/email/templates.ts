import { type EmailBody, greet, greetText, panel, paragraph, shell } from "./layout";

export type { EmailBody } from "./layout";

/**
 * Sent on signup, and again if an unverified account signs in. Single-purpose:
 * verifying is what lifts an account off the guest allowance onto the Free
 * monthly credits, so the copy says what the click buys and nothing else.
 */
export function verificationEmail(input: {
  name?: string | null;
  url: string;
  site: string;
}): EmailBody {
  return {
    subject: "Verify your OpenDiagram email",
    html: shell({
      site: input.site,
      preview: "Confirm your address to unlock your monthly credits.",
      hero: {
        file: "verify.png",
        alt: "The OpenDiagram octopus inspecting an ID badge",
        bg: "#98d7fa",
      },
      eyebrow: "Verify it's you",
      headline: "Is this your inbox?",
      bodyHtml: [
        paragraph(greet(input.name)),
        paragraph("Confirm your email address to unlock your monthly OpenDiagram credits."),
      ].join("\n"),
      cta: { label: "Verify email address", url: input.url },
      finePrint:
        "This link expires in an hour. Didn't sign up? Ignore this email and nothing happens.",
    }),
    text: [
      greetText(input.name),
      "",
      "Confirm your email address to unlock your monthly OpenDiagram credits:",
      input.url,
      "",
      "This link expires in an hour. If you didn't sign up, you can ignore this.",
    ].join("\n"),
  };
}

/**
 * Sent once per account: after email verification, or at creation for GitHub
 * sign-ups, which arrive verified. Sending it at signup instead would race the
 * verification mail in the inbox and bury the one that unlocks the account.
 */
export function welcomeEmail(input: {
  name?: string | null;
  dashboardUrl: string;
  credits: number;
  site: string;
}): EmailBody {
  return {
    subject: "Welcome to OpenDiagram",
    html: shell({
      site: input.site,
      preview: `You're in. ${input.credits} diagram credits are on your account.`,
      hero: {
        file: "welcome.png",
        alt: "The OpenDiagram octopus drawing a system diagram at a drafting desk",
        bg: "#fbd79d",
      },
      eyebrow: "Welcome to OpenDiagram",
      headline: "Describe it. We'll draw it.",
      bodyHtml: [
        paragraph(greet(input.name)),
        paragraph(
          `You're in, and <strong>${input.credits} diagram credits</strong> are on your account.`,
        ),
        panel(`<strong style="color:#18181b;">Three things worth trying first</strong>
<ul style="margin:8px 0 0;padding-left:20px;">
<li>Describe a system in plain English and let it draw the architecture.</li>
<li>Ask for a change ("add a Redis cache") instead of dragging boxes.</li>
<li>Add your own AI key in Settings for <strong>unlimited</strong> diagrams, free forever.</li>
</ul>`),
      ].join("\n"),
      cta: { label: "Open your dashboard", url: input.dashboardUrl },
      finePrint:
        "Replying to this email reaches us directly. Tell us what you're building and what's missing.",
    }),
    text: [
      greetText(input.name),
      "",
      `You're in, and ${input.credits} diagram credits are on your account.`,
      "",
      "Three things worth trying first:",
      "- Describe a system in plain English and let it draw the architecture.",
      '- Ask for a change ("add a Redis cache") instead of dragging boxes.',
      "- Add your own AI key in Settings for unlimited diagrams, free forever.",
      "",
      `Open your dashboard: ${input.dashboardUrl}`,
      "",
      "Replying to this email reaches us directly.",
    ].join("\n"),
  };
}

/** Sent on an explicit reset request only, so it names the request and the expiry. */
export function passwordResetEmail(input: {
  name?: string | null;
  url: string;
  site: string;
}): EmailBody {
  return {
    subject: "Reset your OpenDiagram password",
    html: shell({
      site: input.site,
      preview: "Set a new password for your OpenDiagram account.",
      hero: {
        file: "reset.png",
        alt: "The OpenDiagram octopus holding out a brass key",
        bg: "#fee276",
      },
      eyebrow: "Password reset",
      headline: "Locked out? Here's your key.",
      bodyHtml: [
        paragraph(greet(input.name)),
        paragraph(
          "Someone asked to reset the password on your OpenDiagram account. If that was you, pick a new one below.",
        ),
      ].join("\n"),
      cta: { label: "Set a new password", url: input.url },
      finePrint:
        "This link expires in an hour and works once. Didn't ask for it? Ignore this email and your password stays as it is.",
    }),
    text: [
      greetText(input.name),
      "",
      "Someone asked to reset the password on your OpenDiagram account.",
      `Set a new password: ${input.url}`,
      "",
      "This link expires in an hour and can be used once. If you didn't request it,",
      "ignore this email and your password stays as it is.",
    ].join("\n"),
  };
}

/**
 * Sent after a reset completes. Every session is revoked on reset, so if someone
 * else did it, this mail is the owner's only signal; it points back at the reset
 * page, which works without being signed in.
 */
export function passwordChangedEmail(input: { name?: string | null; site: string }): EmailBody {
  const resetUrl = `${input.site}/reset-password`;
  return {
    subject: "Your OpenDiagram password was changed",
    html: shell({
      site: input.site,
      preview: "Your password was changed and every device was signed out.",
      hero: {
        file: "password-changed.png",
        alt: "The OpenDiagram octopus fitting a new lock on a vault door",
        bg: "#a0efc0",
      },
      eyebrow: "Security notice",
      headline: "Your password was changed.",
      bodyHtml: [
        paragraph(greet(input.name)),
        paragraph(
          "The password on your OpenDiagram account was just changed, and every device was signed out. If that was you, you're all set.",
        ),
        paragraph(
          "<strong>Wasn't you?</strong> Reset your password now, then reply to this email so we can help.",
        ),
      ].join("\n"),
      cta: { label: "Reset your password", url: resetUrl },
      finePrint: "We send this whenever your account password changes.",
    }),
    text: [
      greetText(input.name),
      "",
      "The password on your OpenDiagram account was just changed, and every device",
      "was signed out. If that was you, you're all set.",
      "",
      `Wasn't you? Reset your password now: ${resetUrl}`,
      "Then reply to this email so we can help.",
    ].join("\n"),
  };
}
