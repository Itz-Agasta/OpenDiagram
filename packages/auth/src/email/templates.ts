/**
 * Transactional email templates.
 *
 * All three share one shell so the brand reads the same whichever message a user
 * gets first. Constraints that shape the markup: Gmail strips `<style>` blocks
 * and Outlook ignores most layout CSS, so every rule is inline and the layout is
 * a single column with no floats or flexbox. Colours are literal hex rather than
 * CSS variables for the same reason.
 *
 * Every template returns HTML *and* plain text. The text part isn't a courtesy:
 * a missing text/plain alternative is a spam-filter signal, and these are the
 * mails that must not land in spam.
 */

export type EmailBody = { subject: string; html: string; text: string };

/** User-controlled strings (display names) can't go into markup unescaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function greet(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Hi ${escapeHtml(trimmed)},` : "Hi,";
}

type ShellInput = {
  /** Short pre-header: the grey preview line clients show next to the subject. */
  preview: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Rendered small and grey under the CTA. */
  footerHtml?: string;
};

function shell({ preview, bodyHtml, cta, footerHtml }: ShellInput): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <p style="margin:0 0 28px;font-size:17px;font-weight:600;letter-spacing:-0.01em;">OpenDiagram</p>
      ${bodyHtml}
      ${
        cta
          ? `<p style="margin:28px 0 0;">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 22px;border-radius:8px;">${escapeHtml(cta.label)}</a>
      </p>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#71717a;">
        Button not working? Paste this into your browser:<br />
        <a href="${escapeHtml(cta.url)}" style="color:#3f3f46;word-break:break-all;">${escapeHtml(cta.url)}</a>
      </p>`
          : ""
      }
      ${footerHtml ? `<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #f4f4f5;font-size:13px;line-height:1.6;color:#71717a;">${footerHtml}</p>` : ""}
    </div>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#a1a1aa;text-align:center;">
      OpenDiagram &middot; open-source AI workspace for software architecture
    </p>
  </body>
</html>`;
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;">${html}</p>`;
}

/**
 * Sent on signup, and again if an unverified account signs in. Single-purpose:
 * verifying is what lifts an account off the guest allowance onto the Free
 * monthly credits, so the copy says what the click buys and nothing else.
 */
export function verificationEmail(input: { name?: string | null; url: string }): EmailBody {
  return {
    subject: "Verify your OpenDiagram email",
    html: shell({
      preview: "Confirm your address to unlock your monthly credits.",
      bodyHtml: [
        paragraph(greet(input.name)),
        paragraph("Confirm your email address to unlock your monthly OpenDiagram credits."),
      ].join("\n      "),
      cta: { label: "Verify email address", url: input.url },
      footerHtml: "This link expires in an hour. Didn't sign up? You can ignore this email.",
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
 * Sent once, immediately after verification succeeds -- not at signup. Sending a
 * welcome before the address is confirmed means the two mails race in the inbox
 * and the one that matters (verification) is the one that gets buried.
 */
export function welcomeEmail(input: {
  name?: string | null;
  dashboardUrl: string;
  credits: number;
}): EmailBody {
  return {
    subject: "Welcome to OpenDiagram",
    html: shell({
      preview: `You're verified. ${input.credits} diagram credits are on your account.`,
      bodyHtml: [
        paragraph(greet(input.name)),
        paragraph(
          `You're verified, and <strong>${input.credits} diagram credits</strong> are on your account.`,
        ),
        paragraph("Three things worth trying first:"),
        `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.8;">
        <li>Describe a system in plain English and let it draw the architecture.</li>
        <li>Ask for a change ("add a Redis cache") instead of dragging boxes.</li>
        <li>Add your own AI key in Settings for <strong>unlimited</strong> diagrams, free forever.</li>
      </ul>`,
      ].join("\n      "),
      cta: { label: "Open your dashboard", url: input.dashboardUrl },
      footerHtml:
        "Replying to this email reaches us directly - tell us what you're building and what's missing.",
    }),
    text: [
      greetText(input.name),
      "",
      `You're verified, and ${input.credits} diagram credits are on your account.`,
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
export function passwordResetEmail(input: { name?: string | null; url: string }): EmailBody {
  return {
    subject: "Reset your OpenDiagram password",
    html: shell({
      preview: "Set a new password for your OpenDiagram account.",
      bodyHtml: [
        paragraph(greet(input.name)),
        paragraph("Someone asked to reset the password on your OpenDiagram account."),
      ].join("\n      "),
      cta: { label: "Set a new password", url: input.url },
      footerHtml:
        "This link expires in an hour and can be used once. If you didn't request it, ignore this email - your password stays as it is.",
    }),
    text: [
      greetText(input.name),
      "",
      "Someone asked to reset the password on your OpenDiagram account.",
      `Set a new password: ${input.url}`,
      "",
      "This link expires in an hour and can be used once. If you didn't request it,",
      "ignore this email - your password stays as it is.",
    ].join("\n"),
  };
}

/** The text part is not markup, so it takes the raw name rather than the escaped one. */
function greetText(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Hi ${trimmed},` : "Hi,";
}
