import type { FileUIPart } from "ai";

/**
 * Past either of these, a paste becomes an attachment chip instead of composer
 * text. 100 lines, not 40: Hermes WebUI shipped 40 and raised it after short
 * logs kept turning into files.
 * https://github.com/nesquena/hermes-webui/pull/4372
 */
const ATTACH_OVER_CHARS = 2_000;
const ATTACH_OVER_LINES = 100;
/** ~25k tokens. A paste is re-sent with every later turn, so it is capped, not just shown. */
export const MAX_PASTE_CHARS = 100_000;

// A copied block usually ends in a newline; it is not a line of its own.
const lineCount = (text: string) => text.replace(/\n$/, "").split("\n").length;

export function shouldAttachPaste(text: string) {
  return text.length > ATTACH_OVER_CHARS || lineCount(text) > ATTACH_OVER_LINES;
}

export function pastedTextFile(text: string) {
  const lines = lineCount(text);
  return new File([text], `Pasted text · ${lines} line${lines === 1 ? "" : "s"}`, {
    type: "text/plain",
  });
}

export const isTextFilePart = (part: { type: string; mediaType?: string }): part is FileUIPart =>
  part.type === "file" && Boolean(part.mediaType?.startsWith("text/"));

/**
 * The text inside a `text/*` file part. The composer turns blob URLs into data
 * URLs on submit, so a sent part is always a data URL; anything else reads as "".
 */
export function fileUIPartText(part: FileUIPart) {
  const match = /^data:[^,]*?(;base64)?,(.*)$/.exec(part.url);
  if (!match) return "";
  const [, base64, payload = ""] = match;
  if (!base64) return decodeURIComponent(payload);
  const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
