import type ZAI from "z-ai-web-dev-sdk";

/**
 * Retry helpers for z-ai-web-dev-sdk calls. The upstream free tier can
 * return 429 (rate limit) fairly easily, or transient 5xx errors; these
 * helpers wrap the create call with exponential backoff — capped higher
 * than a typical paid-tier setup, since free-tier rate limit windows
 * tend to be longer.
 */

const MAX_RETRIES = 4;
const MODEL = "glm-4.5-flash"; // free tier — see Z.ai pricing page

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
        model: MODEL,
        messages,
        thinking: { type: "disabled" },
        stream: true,
      });
      return result as ReadableStream<Uint8Array>;
    } catch (err) {
      console.error(
        "[ZAI SDK exception - stream]",
        err instanceof Error
          ? { message: err.message, stack: err.stack, ...(err as any) }
          : err
      );
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
      const backoff = Math.min(
        1200 * Math.pow(2, attempt) + Math.random() * 600,
        15000,
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
        model: MODEL,
        messages,
        thinking: { type: "disabled" },
      });
      return result as {
        choices?: Array<{ message?: { content?: string } }>;
      };
    } catch (err) {
      console.error(
        "[ZAI SDK exception - json]",
        err instanceof Error
          ? { message: err.message, stack: err.stack, ...(err as any) }
          : err
      );
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES - 1) throw err;
      const backoff = Math.min(
        1200 * Math.pow(2, attempt) + Math.random() * 600,
        15000,
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}
