"use client";

import { useCallback, useRef, useState } from "react";
import {
  Send,
  Plus,
  RefreshCw,
  StopCircle,
  BookOpen,
  Network,
  Gavel,
  ArrowRight,
} from "lucide-react";
import { AGENTS, type AgentId } from "@/lib/agents";
import { AgentCard, type AgentCardState } from "@/components/agent-card";
import { ReviewPanel, type ReviewState } from "@/components/review-panel";
import { useToast } from "@/hooks/use-toast";

/* ---------- helpers ---------- */

function initialAgents(): AgentCardState[] {
  return AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    status: "idle" as const,
    content: "",
    tokens: 0,
    latencyMs: 0,
  }));
}

const EMPTY_REVIEW: ReviewState = {
  phase: "idle",
  scores: [],
  synthesis: "",
};

/** Reads a fetch Response body as a Server-Sent Events stream. */
async function readSSE(
  response: Response,
  onEvent: (evt: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        onEvent(JSON.parse(payload));
      } catch {
        /* ignore malformed event */
      }
    }
  }
}

/* ---------- branding ---------- */

function RmaacaMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Navy shield */}
      <path
        d="M24 2 L44 8 V24 C44 35 35 43 24 46 C13 43 4 35 4 24 V8 Z"
        fill="#0F2A4A"
        stroke="#B8893A"
        strokeWidth="2"
      />
      {/* Gold "R" monogram */}
      <text
        x="24"
        y="32"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="24"
        fontWeight="700"
        fill="#D4AF6A"
      >
        R
      </text>
    </svg>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--border)] bg-[color:var(--card)]/95 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--card)]/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <RmaacaMark className="h-9 w-9" />
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif-display text-xl font-bold tracking-tight text-[color:var(--navy)]">
            rmaaca
          </span>
          <span className="font-serif-display text-xl font-bold text-[color:var(--gold)]">.in</span>
        </div>
        <span className="ml-2 hidden text-xs font-medium uppercase tracking-widest text-[color:var(--muted-foreground)] sm:inline">
          Multi-Model AI Peer Review
        </span>
      </div>
      <div className="gold-divider" />
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-[color:var(--border)] bg-[color:var(--cream)]">
      <div className="gold-divider" />
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
        <div className="flex items-center gap-2">
          <RmaacaMark className="h-6 w-6" />
          <span className="font-serif-display text-sm font-semibold text-[color:var(--navy)]">
            rmaaca.in
          </span>
        </div>
        <p className="text-xs text-[color:var(--muted-foreground)]">
          Three GLM-4.6 agents · One peer reviewer · Powered by Z.ai
        </p>
      </div>
    </footer>
  );
}

/* ---------- hero / prompt input ---------- */

function StepStrip() {
  const steps = [
    {
      icon: Network,
      title: "Three agents respond",
      body: "Analytical, Creative, and Practical agents tackle your prompt in parallel.",
    },
    {
      icon: Gavel,
      title: "Peer review",
      body: "A senior reviewer scores each response 0–100 on accuracy, depth, clarity.",
    },
    {
      icon: BookOpen,
      title: "Best answer",
      body: "The reviewer synthesizes one final answer from the strongest elements.",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {steps.map((s, i) => (
        <div
          key={s.title}
          className="relative rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--navy)]/8 text-[color:var(--navy)]">
              <s.icon className="h-4 w-4" />
            </div>
            <span className="font-serif-display text-xs font-bold uppercase tracking-wider text-[color:var(--gold)]">
              Step {i + 1}
            </span>
          </div>
          <h4 className="font-serif-display text-sm font-semibold text-[color:var(--navy)]">
            {s.title}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--muted-foreground)]">
            {s.body}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------- main page ---------- */

export default function Home() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentCardState[]>(initialAgents);
  const [review, setReview] = useState<ReviewState>(EMPTY_REVIEW);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runSubmit = useCallback(
    async (promptText: string) => {
      const p = promptText.trim();
      if (!p) return;

      // Cancel any in-flight run
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSubmittedPrompt(p);
      setAgents(initialAgents());
      setReview(EMPTY_REVIEW);
      setIsRunning(true);

      const collected: Record<AgentId, string> = {
        analytical: "",
        creative: "",
        practical: "",
      };

      try {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => res.statusText);
          throw new Error(`Agents request failed (${res.status}): ${errText}`);
        }

        await readSSE(
          res,
          (evt) => {
            const t = evt.type as string;
            if (t === "start") {
              const agentId = evt.agent as AgentId;
              setAgents((prev) =>
                prev.map((a) =>
                  a.id === agentId ? { ...a, status: "running" } : a,
                ),
              );
            } else if (t === "token") {
              const agentId = evt.agent as AgentId;
              const delta = evt.content as string;
              collected[agentId] += delta;
              const full = collected[agentId];
              setAgents((prev) =>
                prev.map((a) =>
                  a.id === agentId
                    ? { ...a, status: "running", content: full }
                    : a,
                ),
              );
            } else if (t === "done") {
              const agentId = evt.agent as AgentId;
              setAgents((prev) =>
                prev.map((a) =>
                  a.id === agentId
                    ? {
                        ...a,
                        status: "done",
                        tokens: evt.tokens as number,
                        latencyMs: evt.latencyMs as number,
                      }
                    : a,
                ),
              );
            } else if (t === "error") {
              const agentId = evt.agent as AgentId;
              setAgents((prev) =>
                prev.map((a) =>
                  a.id === agentId
                    ? {
                        ...a,
                        status: "error",
                        error: (evt.message as string) ?? "Unknown error",
                        tokens: (evt.tokens as number) ?? 0,
                        latencyMs: (evt.latencyMs as number) ?? 0,
                      }
                    : a,
                ),
              );
            } else if (t === "fatal") {
              throw new Error(evt.message as string);
            }
            // "session" and "all-done" events need no UI action
          },
          controller.signal,
        );

        // Only proceed to review if not aborted
        if (controller.signal.aborted) return;

        // ----- Peer review phase -----
        setReview({ phase: "scoring", scores: [], synthesis: "" });

        const reviewRes = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: p,
            responses: AGENTS.map((a) => ({
              id: a.id,
              name: a.name,
              content: collected[a.id],
            })),
          }),
          signal: controller.signal,
        });

        if (!reviewRes.ok) {
          const errText = await reviewRes.text().catch(() => reviewRes.statusText);
          throw new Error(`Review request failed (${reviewRes.status}): ${errText}`);
        }

        let synthesis = "";
        await readSSE(
          reviewRes,
          (evt) => {
            const t = evt.type as string;
            if (t === "scoring") {
              setReview((r) => ({ ...r, phase: "scoring" }));
            } else if (t === "scores") {
              const scores = evt.scores as ReviewState["scores"];
              setReview((r) => ({ ...r, phase: "scored", scores }));
              setAgents((prev) =>
                prev.map((a) => {
                  const s = scores.find((x) => x.id === a.id);
                  return s
                    ? { ...a, score: s.score, rationale: s.rationale }
                    : a;
                }),
              );
            } else if (t === "synthesizing") {
              setReview((r) => ({ ...r, phase: "synthesizing" }));
            } else if (t === "token") {
              synthesis += evt.content as string;
              setReview((r) => ({
                ...r,
                phase: "synthesizing",
                synthesis,
              }));
            } else if (t === "done") {
              setReview((r) => ({ ...r, phase: "done" }));
            } else if (t === "error") {
              setReview((r) => ({
                ...r,
                phase: "error",
                error: (evt.message as string) ?? "Unknown error",
              }));
            }
          },
          controller.signal,
        );
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError") return;
        setReview((r) => ({
          ...r,
          phase: "error",
          error: e.message,
        }));
        toast({
          title: "Something went wrong",
          description: e.message,
          variant: "destructive",
        });
      } finally {
        if (!controller.signal.aborted) {
          setIsRunning(false);
        }
      }
    },
    [toast],
  );

  const handleSubmit = useCallback(() => {
    void runSubmit(prompt);
  }, [prompt, runSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleNew = useCallback(() => {
    abortRef.current?.abort();
    setSubmittedPrompt(null);
    setAgents(initialAgents());
    setReview(EMPTY_REVIEW);
    setIsRunning(false);
    setPrompt("");
  }, []);

  const handleRegenerate = useCallback(() => {
    if (submittedPrompt && !isRunning) {
      void runSubmit(submittedPrompt);
    }
  }, [submittedPrompt, isRunning, runSubmit]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    toast({ title: "Stopped", description: "The run was cancelled." });
  }, [toast]);

  /* ---------- render ---------- */

  const showSession = submittedPrompt !== null;

  return (
    <div className="paper-bg flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {!showSession ? (
          /* ---------- HERO ---------- */
          <div className="mx-auto max-w-3xl pt-6 sm:pt-12">
            <div className="text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color:var(--gold)]/30 bg-[color:var(--gold)]/8 px-3 py-1 text-xs font-medium uppercase tracking-widest text-[color:var(--gold)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--gold)]" />
                Multi-Agent Consensus Engine
              </div>
              <h1 className="font-serif-display text-4xl font-bold leading-tight text-[color:var(--navy)] sm:text-5xl">
                One prompt. Three expert agents.
                <br />
                <span className="text-[color:var(--gold)]">One peer-reviewed answer.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[color:var(--muted-foreground)]">
                Submit a prompt and three GLM-4.6 agents — analytical, creative, and
                practical — respond in parallel. A senior peer reviewer then scores
                each response and synthesizes the single best final answer.
              </p>
            </div>

            {/* Prompt input */}
            <div className="mt-8 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-2 shadow-sm">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything — a concept to explain, a decision to weigh, a problem to solve…"
                rows={5}
                className="w-full resize-none bg-transparent px-3 py-3 text-sm text-[color:var(--ink)] placeholder:text-[color:var(--muted-foreground)] focus:outline-none"
              />
              <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] px-3 pt-2">
                <span className="text-[11px] text-[color:var(--muted-foreground)]">
                  Press <kbd className="rounded border border-[color:var(--border)] bg-[color:var(--muted)] px-1.5 py-0.5 text-[10px] font-mono">⌘/Ctrl</kbd> + <kbd className="rounded border border-[color:var(--border)] bg-[color:var(--muted)] px-1.5 py-0.5 text-[10px] font-mono">↵</kbd> to submit
                </span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || isRunning}
                  className="inline-flex items-center gap-2 rounded-md navy-gradient px-5 py-2 text-sm font-semibold text-[color:var(--cream)] shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Run agents
                </button>
              </div>
            </div>

            <div className="mt-10">
              <h3 className="mb-3 text-center font-serif-display text-sm font-semibold uppercase tracking-widest text-[color:var(--muted-foreground)]">
                How it works
              </h3>
              <StepStrip />
            </div>
          </div>
        ) : (
          /* ---------- SESSION VIEW ---------- */
          <div className="space-y-6">
            {/* Prompt bar */}
            <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--gold)]">
                    Prompt
                  </span>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink)]">
                    {submittedPrompt}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isRunning ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)] transition-colors hover:border-[color:var(--gold)] hover:text-[color:var(--gold)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleNew}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)] transition-colors hover:border-[color:var(--gold)] hover:text-[color:var(--gold)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </button>
                </div>
              </div>
            </div>

            {/* Section title for agents */}
            <div className="flex items-center gap-3">
              <h2 className="font-serif-display text-lg font-bold text-[color:var(--navy)]">
                Agent Responses
              </h2>
              <div className="h-px flex-1 gold-divider" />
              <span className="text-xs text-[color:var(--muted-foreground)]">
                {agents.filter((a) => a.status === "done").length}/{agents.length} complete
              </span>
            </div>

            {/* Agent cards grid */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>

            {/* Peer review panel — appears once agents are done or errored */}
            <div className="pt-2">
              <div className="mb-4 flex items-center gap-3">
                <h2 className="font-serif-display text-lg font-bold text-[color:var(--navy)]">
                  Peer Review &amp; Synthesis
                </h2>
                <div className="h-px flex-1 gold-divider" />
                {isRunning && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--muted-foreground)]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--gold)]" />
                    in progress
                  </span>
                )}
              </div>
              <ReviewPanel review={review} />
            </div>

            {/* Bottom CTA */}
            {!isRunning && review.phase === "done" && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5 p-6 text-center">
                <ArrowRight className="h-5 w-5 rotate-[-90deg] text-[color:var(--gold)]" />
                <p className="font-serif-display text-base font-semibold text-[color:var(--navy)]">
                  Want a different angle?
                </p>
                <p className="max-w-md text-sm text-[color:var(--muted-foreground)]">
                  Regenerate to get fresh responses from the agents, or start a new
                  prompt to explore another question.
                </p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    className="inline-flex items-center gap-2 rounded-md navy-gradient px-4 py-2 text-sm font-semibold text-[color:var(--cream)] shadow-sm hover:shadow-md"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={handleNew}
                    className="inline-flex items-center gap-2 rounded-md border border-[color:var(--navy)] bg-[color:var(--card)] px-4 py-2 text-sm font-semibold text-[color:var(--navy)] hover:bg-[color:var(--cream)]"
                  >
                    <Plus className="h-4 w-4" />
                    New prompt
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
