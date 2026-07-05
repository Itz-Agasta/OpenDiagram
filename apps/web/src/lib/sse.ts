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

// Fallback for the reconnect/already-in-flight case: when a job is already
// running the server streams one snapshot then closes, so the stream resolves
// on a non-terminal status. Poll the job's GET endpoint until it reaches a
// terminal state, forwarding each update.
export async function pollUntilTerminal<T>(
  fetchLatest: () => Promise<T>,
  isTerminal: (value: T) => boolean,
  onUpdate: (value: T) => void,
  options?: { signal?: AbortSignal; intervalMs?: number; maxAttempts?: number },
): Promise<T> {
  const intervalMs = options?.intervalMs ?? 1200;
  const maxAttempts = options?.maxAttempts ?? 300;
  let latest: T | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options?.signal?.aborted) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (options?.signal?.aborted) break;

    latest = await fetchLatest();
    onUpdate(latest);
    if (isTerminal(latest)) return latest;
  }

  if (latest !== undefined) return latest;
  throw new Error("Timed out waiting for the job to finish.");
}
