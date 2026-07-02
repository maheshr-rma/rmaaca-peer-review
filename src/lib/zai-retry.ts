import type ZAI from "z-ai-web-dev-sdk";

/**
 * Retry helpers for z-ai-web-dev-sdk calls. The upstream API can return 429
 * (rate limit) or transient 5xx errors; these helpers wrap the create call
 * with exponential backoff so a brief rate-limit blip doesn't fail the whole
 * multi-agent run.
 */

const MAX_RETRIES = 3;

function isRetryable(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return /429|rate.?limit|too many requests|5\d{2}|server error|timeout|econnreset|fetch failed/i.test(
    msg,
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ZaiInstance = Awaited<ReturnType<typeof ZAI.create>>;
type ChatMessage = { role: "assistant" | "user"; content: string };

/** Streaming create with retry. Returns the raw ReadableStream<Uint8Array>. */
export async function createStreamWithRetry(
  zai: ZaiInstance,
  messages: ChatMessage[],
): Promise<ReadableStream<Uint8Array>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await zai.chat.completions.create({
        messages,
        thinking: { type: "disabled" },
        stream: true,
      });
      return result as ReadableStream<Uint8Array>;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
      const backoff = Math.min(
        800 * Math.pow(2, attempt) + Math.random() * 400,
        6000,
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}

/** Non-streaming create with retry. Returns the parsed completion object. */
export async function createJsonWithRetry(
  zai: ZaiInstance,
  messages: ChatMessage[],
): Promise<{
  choices?: Array<{ message?: { content?: string } }>;
}> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await zai.chat.completions.create({
        messages,
        thinking: { type: "disabled" },
      });
      return result as {
        choices?: Array<{ message?: { content?: string } }>;
      };
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
      const backoff = Math.min(
        800 * Math.pow(2, attempt) + Math.random() * 400,
        6000,
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}
