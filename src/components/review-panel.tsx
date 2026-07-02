"use client";

import { memo } from "react";
import { Award, Loader2, Scale, PenLine, CheckCircle2 } from "lucide-react";
import { Markdown, CopyButton } from "@/components/markdown";
import type { AgentId } from "@/lib/agents";

export interface ReviewScore {
  id: AgentId;
  name: string;
  score: number;
  rationale: string;
}

export type ReviewPhase =
  | "idle"
  | "scoring"
  | "scored"
  | "synthesizing"
  | "done"
  | "error";

export interface ReviewState {
  phase: ReviewPhase;
  scores: ReviewScore[];
  synthesis: string;
  error?: string;
}

function scoreBarColor(score: number) {
  if (score >= 85) return "bg-emerald-600";
  if (score >= 70) return "bg-[color:var(--gold)]";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-600";
}

function ReviewPanelBase({ review }: { review: ReviewState }) {
  const {
    phase,
    scores,
    synthesis,
    error,
  } = review;

  const showScores = phase === "scoring" || phase === "scored" || phase === "synthesizing" || phase === "done";
  const showSynth = phase === "synthesizing" || phase === "done";
  const isStreamingSynth = phase === "synthesizing";

  return (
    <section className="overflow-hidden rounded-lg border-2 border-[color:var(--navy)] bg-[color:var(--card)] shadow-md">
      {/* Header banner */}
      <div className="navy-gradient px-6 py-4 text-[color:var(--cream)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[color:var(--gold)] bg-[color:var(--navy)]/40">
            <Award className="h-5 w-5 text-[color:var(--gold)]" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <h2 className="font-serif-display text-xl font-bold leading-tight">
              Peer Review
            </h2>
            <p className="text-xs text-[color:var(--gold-light)]/90 mt-0.5">
              Senior reviewer scores each response, then synthesizes the best final answer.
            </p>
          </div>
          <PhaseBadge phase={phase} />
        </div>
      </div>

      <div className="gold-divider" />

      {/* Body */}
      <div className="p-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Scores */}
        {showScores && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Scale className="h-4 w-4 text-[color:var(--gold)]" />
              <h3 className="font-serif-display text-sm font-semibold uppercase tracking-wide text-[color:var(--navy)]">
                Scores
              </h3>
              {phase === "scoring" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--muted-foreground)]" />
              )}
            </div>
            <div className="space-y-3">
              {scores.length === 0 && phase === "scoring" && (
                <p className="text-sm text-[color:var(--muted-foreground)] italic">
                  Reviewer is reading the responses…
                </p>
              )}
              {scores.map((s) => (
                <div key={s.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-[color:var(--navy)]">
                      {s.name}
                    </span>
                    <span className="font-mono text-sm font-bold text-[color:var(--navy)]">
                      {s.score}<span className="text-[color:var(--muted-foreground)] text-xs font-normal">/100</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--muted)]">
                    <div
                      className={`h-full ${scoreBarColor(s.score)} transition-all duration-700 ease-out`}
                      style={{ width: `${s.score}%` }}
                    />
                  </div>
                  <p className="text-[11px] leading-snug text-[color:var(--muted-foreground)]">
                    {s.rationale}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Synthesis */}
        {showSynth && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PenLine className="h-4 w-4 text-[color:var(--gold)]" />
                <h3 className="font-serif-display text-sm font-semibold uppercase tracking-wide text-[color:var(--navy)]">
                  Synthesized Final Answer
                </h3>
                {isStreamingSynth && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--muted-foreground)]" />
                )}
                {phase === "done" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
              </div>
              {synthesis && (
                <CopyButton text={synthesis} label="Copy answer" />
              )}
            </div>
            <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--cream)]/40 p-4">
              {synthesis ? (
                <Markdown content={synthesis} streaming={isStreamingSynth} />
              ) : (
                <p className="text-sm text-[color:var(--muted-foreground)] italic">
                  Reviewer is composing the final answer…
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PhaseBadge({ phase }: { phase: ReviewPhase }) {
  const map: Record<ReviewPhase, { label: string; cls: string }> = {
    idle: { label: "Pending", cls: "bg-white/10 text-[color:var(--cream)]" },
    scoring: { label: "Scoring", cls: "bg-[color:var(--gold)]/20 text-[color:var(--gold-light)]" },
    scored: { label: "Scored", cls: "bg-[color:var(--gold)]/20 text-[color:var(--gold-light)]" },
    synthesizing: { label: "Synthesizing", cls: "bg-[color:var(--gold)]/30 text-[color:var(--gold-light)]" },
    done: { label: "Complete", cls: "bg-emerald-500/25 text-emerald-100" },
    error: { label: "Error", cls: "bg-rose-500/25 text-rose-100" },
  };
  const m = map[phase];
  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  );
}

export const ReviewPanel = memo(ReviewPanelBase);
