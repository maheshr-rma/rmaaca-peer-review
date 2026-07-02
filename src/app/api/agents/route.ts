import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { AGENTS, type AgentId } from "@/lib/agents";
import { consumeSSEStream, extractDelta } from "@/lib/sse-parse";
import { createStreamWithRetry, sleep } from "@/lib/zai-retry";
import { ensureZaiConfig } from "@/lib/zai-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agents
 * Body: { prompt: string }
 *
 * Returns a Server-Sent Events stream. Three agents (Analytical, Creative,
 * Practical) run GLM-4.5-Flash in parallel with distinct personas. Starts are
 * staggered to avoid hitting the free tier's tight rate limits, and each
 * agent retries on 429/5xx with exponential backoff.
 *
 * Event types (each sent as `data: {json}\n\n`):
 *   { type: "session", prompt }
 *   { type: "start",   agent }
 *   { type: "token",   agent, content }
 *   { type: "done",    agent, tokens, latencyMs }
 *   { type: "error",   agent, message }
 *   { type: "fatal",   message }
 *   { type: "all-done" }
 */

const STAGGER_MS = 2000; // widened from 350ms — free tier rate limits are tight

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt: string = (body?.prompt ?? "").toString().trim();

  if (!prompt) {
    return new Response(
      JSON.stringify({ error: "Prompt is required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      let zai: Awaited<ReturnType<typeof ZAI.create>>;
      try {
        ensureZaiConfig();
        zai = await ZAI.create();
      } catch (err) {
        send({ type: "fatal", message: (err as Error).message });
        controller.close();
        return;
      }

      send({ type: "session", prompt });

      const runAgent = async (agentId: AgentId, staggerMs: number) => {
        const agent = AGENTS.find((a) => a.id === agentId)!;
        if (staggerMs > 0) await sleep(staggerMs);

        const startedAt = Date.now();
        send({ type: "start", agent: agentId });

        let tokenCount = 0;
        try {
          const completion = await createStreamWithRetry(zai, [
            { role: "assistant", content: agent.persona },
            { role: "user", content: prompt },
          ]);

          await consumeSSEStream(completion, (data) => {
            const delta = extractDelta(data);
            if (delta) {
              tokenCount += 1;
              send({ type: "token", agent: agentId, content: delta });
            }
          });

          const latencyMs = Date.now() - startedAt;
          send({
            type: "done",
            agent: agentId,
            tokens: tokenCount,
            latencyMs,
          });
        } catch (err) {
          const latencyMs = Date.now() - startedAt;
          send({
            type: "error",
            agent: agentId,
            message: (err as Error).message,
            tokens: tokenCount,
            latencyMs,
          });
        }
      };

      // Staggered parallel start to reduce concurrent rate-limit pressure
      await Promise.all([
        runAgent("analytical", 0),
        runAgent("creative", STAGGER_MS),
        runAgent("practical", STAGGER_MS * 2),
      ]);

      send({ type: "all-done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
