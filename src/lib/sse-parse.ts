/**
 * Parses a raw byte SSE stream (as returned by z-ai-web-dev-sdk when
 * `stream: true`) into individual JSON data payloads.
 *
 * The upstream API emits OpenAI-compatible SSE:
 *   data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n
 *   data: {"choices":[{"delta":{"content":" world"}}]}\n\n
 *   data: [DONE]\n\n
 *
 * This helper reads the ReadableStream chunk by chunk, buffers partial
 * lines split across chunk boundaries, and invokes `onData` for each
 * complete JSON payload.
 */
export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array> | unknown,
  onData: (data: unknown) => void,
): Promise<void> {
  if (!stream || typeof (stream as ReadableStream).getReader !== "function") {
    throw new Error("Expected a ReadableStream from the SDK streaming response.");
  }
  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line (\n\n)
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      // A single event may contain multiple "data:" lines; concatenate them.
      const dataLines = raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim());

      if (dataLines.length === 0) continue;
      const payload = dataLines.join("\n");
      if (!payload || payload === "[DONE]") continue;

      try {
        onData(JSON.parse(payload));
      } catch {
        /* ignore malformed line */
      }
    }
  }
}

/** Extract a text delta from an OpenAI-compatible SSE chunk. */
export function extractDelta(data: unknown): string {
  const d = data as {
    choices?: Array<{
      delta?: { content?: string; reasoning_content?: string };
      message?: { content?: string };
    }>;
  };
  const choice = d?.choices?.[0];
  if (!choice) return "";
  return (
    choice?.delta?.content ??
    choice?.delta?.reasoning_content ??
    choice?.message?.content ??
    ""
  );
}
