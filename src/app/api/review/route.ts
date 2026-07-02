import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { AGENTS, REVIEWER_PERSONA, type AgentId } from "@/lib/agents";
import { consumeSSEStream, extractDelta } from "@/lib/sse-parse";
import { createJsonWithRetry, createStreamWithRetry } from "@/lib/zai-retry";
import { ensureZaiConfig } from "@/lib/zai-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgentResponseInput {
  id: AgentId;
  name: string;
  content: string;
}

interface ReviewBody {
  prompt: string;
  responses: AgentResponseInput[];
}

/**
 * POST /api/review
 * Body: { prompt, responses: [{ id, name, content }] }
 *
 * Two-phase peer review:
 *   Phase 1 (non-streaming): reviewer assigns each response a score 0-100
 *                            and a one-line rationale, returned as a JSON blob.
 *   Phase 2 (streaming):     reviewer synthesizes a single best final answer
 *                            combining the strongest elements of all responses.
 *
 * SSE events:
 *   { type: "scoring" }                                  — phase 1 started
 *   { type: "scores", scores: [{ id, score, rationale }] }
 *   { type: "synthesizing" }                             — phase 2 started
 *   { type: "token", content }                           — synthesis token
 *   { type: "done" }                                     — review complete
 *   { type: "error", message }
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as ReviewBody;
  const prompt: string = (body?.prompt ?? "").toString().trim();
  const responses: AgentResponseInput[] = Array.isArray(body?.responses)
    ? body.responses
    : [];

  // Only review responses that actually have content (skip errored agents)
  const validResponses = responses.filter(
    (r) => r.content && r.content.trim().length > 0,
  );

  if (!prompt || validResponses.length === 0) {
    return new Response(
      JSON.stringify({ error: "prompt and at least one non-empty response are required." }),
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
        send({ type: "error", message: (err as Error).message });
        controller.close();
        return;
      }

      // ---------- Phase 1: scoring ----------
      send({ type: "scoring" });

      const responsesBlock = validResponses
        .map(
          (r, i) =>
            `### Response ${String.fromCharCode(65 + i)} — ${r.name} (id: "${r.id}")\n\n${r.content}`,
        )
        .join("\n\n---\n\n");

      const idList = validResponses.map((r) => `"${r.id}"`).join(", ");

      const scoringPrompt = `You are reviewing ${validResponses.length} responses to the same prompt.

ORIGINAL PROMPT:
"""
${prompt}
"""

THE ${validResponses.length} RESPONSES:
${responsesBlock}

Score each response on a 0-100 scale based on accuracy, depth, clarity, originality, and usefulness. Be discriminating: reserve 90+ for truly exceptional responses, and use the full range.

Respond with ONLY a valid JSON object (no markdown fences, no commentary) in exactly this shape:
{
  "scores": [
    { "id": "<one of: ${idList}>", "score": <number 0-100>, "rationale": "<one short sentence>" }
  ]
}

The "scores" array MUST contain exactly ${validResponses.length} entries — one per response — using these exact id strings: ${idList}. Use each id exactly once.`;

      let scoresJson: { scores: { id: string; score: number; rationale: string }[] } | null = null;

      try {
        const scoringCompletion = await createJsonWithRetry(zai, [
          { role: "assistant", content: REVIEWER_PERSONA },
          { role: "user", content: scoringPrompt },
        ]);

        let raw = scoringCompletion.choices?.[0]?.message?.content ?? "";
        // Strip any accidental markdown fences
        raw = raw.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
        // Try to extract the JSON object robustly
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          raw = raw.slice(firstBrace, lastBrace + 1);
        }
        scoresJson = JSON.parse(raw);
      } catch (err) {
        send({
          type: "error",
          message: `Scoring failed: ${(err as Error).message}`,
        });
        controller.close();
        return;
      }

      // Only emit scores for agents that had valid (non-empty) responses.
      // Errored agents are excluded from the review entirely.
      const validIds = new Set(validResponses.map((r) => r.id));
      const rawScores = scoresJson?.scores ?? [];

      const scores = AGENTS.filter((a) => validIds.has(a.id)).map((a, idx) => {
        // Primary: match by id. Fallback: match by position (order).
        const found =
          rawScores.find((s) => s.id === a.id) ??
          rawScores.find((s) => s.id?.toLowerCase() === a.id) ??
          rawScores[idx];

        return {
          id: a.id,
          name: a.name,
          score: found
            ? Math.max(0, Math.min(100, Math.round(found.score)))
            : 50,
          rationale: found?.rationale?.trim() || "No rationale provided.",
        };
      });

      send({ type: "scores", scores });

      // ---------- Phase 2: synthesis (streamed) ----------
      send({ type: "synthesizing" });

      const scoresBlock = scores
        .map((s) => `- ${s.name}: ${s.score}/100 — ${s.rationale}`)
        .join("\n");

      const synthPrompt = `You previously scored ${validResponses.length} responses to the prompt below. Now synthesize the single best final answer by combining the strongest elements of every response — incorporating the analytical rigor, the creative insight, and the practical guidance where each is strongest. Eliminate redundancy and correct any errors you noticed during scoring.

ORIGINAL PROMPT:
"""
${prompt}
"""

YOUR SCORES:
${scoresBlock}

Write the final synthesized answer now. Write directly to the user — no preamble about "here is the synthesis", no meta-commentary, no mention of the other responses. Just give the best possible answer to the original prompt.`;

      try {
        const synthCompletion = await createStreamWithRetry(zai, [
          { role: "assistant", content: REVIEWER_PERSONA },
          { role: "user", content: synthPrompt },
        ]);

        await consumeSSEStream(synthCompletion, (data) => {
          const delta = extractDelta(data);
          if (delta) {
            send({ type: "token", content: delta });
          }
        });

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: `Synthesis failed: ${(err as Error).message}`,
        });
      }

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
