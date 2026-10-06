/**
 * Zero-cost thread titles: no model call, only text the conversation already has.
 *
 * A thread starts as "New chat". Its first turn names it after the first diagram
 * it drew, or failing that the first user message, trimmed. A title taken from
 * the message is upgraded once, to the first diagram's title, when one appears
 * on a later turn (`ask_user` first, then the drawing). Any other title was set
 * by the user and is never touched; that is decided by comparing against what
 * the message would have produced, so no column records where a title came from.
 */
export const DEFAULT_THREAD_TITLE = "New chat";
const MAX_TITLE_CHARS = 50;

type AppendedMessage = { role: "user" | "assistant"; parts: unknown };
type LoosePart = { type?: unknown; text?: unknown; data?: { views?: { title?: unknown }[] } };

const partsOf = (parts: unknown): LoosePart[] =>
  Array.isArray(parts)
    ? (parts as (LoosePart | null)[]).flatMap((part) => (part ? [part] : []))
    : [];

/** The first user message as a title: first line, whitespace collapsed, cut at a word. */
export function titleFromText(text: string) {
  const line = (text.trim().split("\n")[0] ?? "").replace(/\s+/g, " ");
  if (line.length <= MAX_TITLE_CHARS) return line;
  const cut = line.slice(0, MAX_TITLE_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${space > 20 ? cut.slice(0, space) : cut.slice(0, MAX_TITLE_CHARS - 1)}…`;
}

/** Joined text parts of a stored message; file parts (pastes) are not a title. */
export function messageText(parts: unknown) {
  return partsOf(parts)
    .flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
    .join("\n");
}

function firstDrawnTitle(messages: AppendedMessage[]) {
  for (const message of messages) {
    for (const part of partsOf(message.parts)) {
      const title = part.type === "data-drawn" ? part.data?.views?.[0]?.title : undefined;
      if (typeof title === "string" && title.trim()) return title.trim().slice(0, 200);
    }
  }
  return null;
}

/**
 * The title an append should set, or null to leave it.
 *
 * `firstUserText` reads the thread's first stored user message, this append
 * included. It is read lazily because it costs a query: an untitled thread
 * needs it (a thread from before auto-titles may already hold messages, and
 * is named from its first one, not from this batch), and a diagram arriving
 * later needs it to tell a message-derived title from a rename.
 */
export async function nextThreadTitle(
  current: string,
  appended: AppendedMessage[],
  firstUserText: () => Promise<string | null>,
) {
  const drawn = firstDrawnTitle(appended);
  if (current === DEFAULT_THREAD_TITLE) {
    if (drawn) return drawn;
    const first = await firstUserText();
    return first?.trim() ? titleFromText(first) : null;
  }
  if (!drawn || drawn === current) return null;
  const first = await firstUserText();
  return first && titleFromText(first) === current ? drawn : null;
}
