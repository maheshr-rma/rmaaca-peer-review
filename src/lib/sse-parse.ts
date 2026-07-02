/**
 * Parses a raw byte SSE stream (as returned by z-ai-web-dev-sdk when
 * `stream: true`) into individual JSON data payloads.
 *
 * Handles three possible SDK return shapes:
 *  1. Web Streams API ReadableStream (getReader())
 *  2. Node.js Readable / async-iterable stream
 *  3. A single already-parsed JSON completion object (non-streaming
 *     fallback) — some accounts/models silently ignore `stream: true`.
 */
export async function consumeSSEStream(
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string> | unknown,
  onData: (data: unknown) => void,
): Promise<void> {
  if (!stream) {
    throw new Error("Expected a stream from the SDK, got null/undefined.");
  }

  let buffer = "";
  const decoder = new TextDecoder();

  const processChunk = (chunk: Uint8Array | string) => {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
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
  };

  // Case 1: native Web ReadableStream
  if (typeof (stream as ReadableStream).getReader === "function") {
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) processChunk(value);
    }
    return;
  }

  // Case 2: Node.js Readable / any async-iterable stream
  if (Symbol.asyncIterator in (stream as object)) {
    for await (const chunk of stream as AsyncIterable<Uint8Array | string>) {
      processChunk(chunk);
    }
    return;
  }

  // Case 3: already-parsed non-streaming completion object.
  // Some accounts return the full response even with stream:true.
  const obj = stream as {
    error?: { message?: string } | string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (obj.error) {
    const msg = typeof obj.error === "string" ? obj.error : obj.error.message;
    throw new Error(msg || "SDK returned an error object.");
  }

  if (obj.choices?.[0]?.message?.content) {
    // Emit the whole content as one "delta" so downstream code
    // (which expects streamed chunks) still works — it just gets
    // one big chunk instead of many small ones.
    onData({ choices: [{ delta: { content: obj.choices[0].message.content } }] });
    return;
  }

  throw new Error(
    `Unsupported stream type from SDK: object. Shape: ${JSON.stringify(obj).slice(0, 200)}`
  );
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
