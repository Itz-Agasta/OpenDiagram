import { env } from "@OpenDiagram/env/server";

export type EmailBody = { subject: string; html: string; text: string };

/** Illustration band under the header. `bg` matches the art's own backdrop, so the
 *  band still reads as designed when the client blocks images. */
export type Hero = { file: string; alt: string; bg: string };

type ShellInput = {
  /** Pre-header: the grey preview line clients show next to the subject. */
  preview: string;
  hero: Hero;
  eyebrow: string;
  headline: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Small grey line under the CTA: expiry, "didn't ask for this". */
  finePrint?: string;
  /** Web app origin, for the footer's Terms and Privacy links. */
  site: string;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#18181b";
const MUTED = "#71717a";
// The mascot's red, darkened until it passes WCAG AA on white.
const ACCENT = "#c8261b";
const GITHUB_URL = "https://github.com/Itz-Agasta/OpenDiagram";

/** User-controlled strings (display names) can't go into markup unescaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function greet(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Hi ${escapeHtml(trimmed)},` : "Hi,";
}

/** The text part is not markup, so it takes the raw name rather than the escaped one. */
export function greetText(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Hi ${trimmed},` : "Hi,";
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3f3f46;">${html}</p>`;
}

/** Left-aligned grey panel for lists: centred bullets are hard to scan. */
export function panel(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;"><tr>
<td style="background:#f4f4f5;border-radius:8px;padding:18px 22px;text-align:left;font-size:15px;line-height:1.7;color:#3f3f46;">${html}</td>
</tr></table>`;
}

function asset(file: string): string {
  return `${env.EMAIL_ASSET_URL.replace(/\/$/, "")}/${file}`;
}

// A table-cell background, not padding on the <a>, is the button form Outlook
// desktop renders; it ignores padding and border-radius on inline elements.
function button(cta: { label: string; url: string }): string {
  const url = escapeHtml(cta.url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 0;"><tr>
<td bgcolor="${INK}" style="border-radius:8px;"><a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a></td>
</tr></table>
<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">Button not working? Paste this into your browser:<br />
<a href="${url}" style="color:#3f3f46;word-break:break-all;">${url}</a></p>`;
}

/**
 * Table layout with inline styles only: Outlook desktop ignores max-width on divs
 * and Gmail strips <style> blocks in many views. 600px column, black brand bar,
 * full-width illustration, centred copy, footer. `color-scheme: light` asks clients
 * not to auto-invert the art in dark mode.
 */
export function shell(input: ShellInput): string {
  const { hero, site } = input;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(input.headline)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f4f5"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:${FONT};">
<tr><td align="center" bgcolor="#111111" style="padding:18px 24px;font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">OpenDiagram</td></tr>
<tr><td bgcolor="${hero.bg}" style="line-height:0;"><img src="${asset(hero.file)}" width="600" alt="${escapeHtml(hero.alt)}" style="display:block;width:100%;height:auto;border:0;" /></td></tr>
<tr><td align="center" style="padding:32px 28px 8px;text-align:center;">
<p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};">${escapeHtml(input.eyebrow)}</p>
<h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;font-weight:700;color:${INK};">${escapeHtml(input.headline)}</h1>
${input.bodyHtml}
${input.cta ? button(input.cta) : ""}
</td></tr>
${
  input.finePrint
    ? `<tr><td style="padding:24px 28px 0;"><p style="margin:0;padding-top:20px;border-top:1px solid #e4e4e7;font-size:13px;line-height:1.6;color:${MUTED};text-align:center;">${input.finePrint}</p></td></tr>`
    : ""
}
<tr><td align="center" style="padding:28px 28px 32px;">
<a href="${GITHUB_URL}"><img src="${asset("github.png")}" width="20" height="20" alt="OpenDiagram on GitHub" style="display:inline-block;border:0;" /></a>
<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
<a href="${site}/terms" style="color:${MUTED};">Terms</a> &middot; <a href="${site}/privacy" style="color:${MUTED};">Privacy</a><br />
OpenDiagram &middot; open-source AI workspace for software architecture</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}
