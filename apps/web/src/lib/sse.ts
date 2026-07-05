// Reads a text/event-stream response body, invoking `onEvent` for each JSON
// `data:` frame, and resolves with the last payload seen. Used for server jobs
// (GitHub import, repo generation) that run inside a streaming request so the
// work keeps its CPU allocation on Cloud Run scale-to-zero.
export async function consumeSSE<T>(
  response: Response,
  onEvent: (data: T) => void,
): Promise<T | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let buffer = "";
  let last: T | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");

      const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      const json = dataLine.slice(5).trim();
      if (!json) continue;

      try {
        last = JSON.parse(json) as T;
        onEvent(last);
      } catch {
        // Ignore a malformed frame; keep reading the stream.
      }
    }
  }

  return last;
}
