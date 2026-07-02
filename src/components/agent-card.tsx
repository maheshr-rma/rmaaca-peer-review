"use client";

import { memo } from "react";
import { Microscope, Sparkles, Wrench, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Markdown, CopyButton } from "@/components/markdown";
import type { AgentId } from "@/lib/agents";

export type AgentStatus = "idle" | "running" | "done" | "error";

export interface AgentCardState {
  id: AgentId;
  name: string;
  description: string;
  status: AgentStatus;
  content: string;
  tokens: number;
  latencyMs: number;
  score?: number;       // 0-100, set during review
  rationale?: string;   // one-line from reviewer
  error?: string;
}

const ICONS: Record<AgentId, typeof Microscope> = {
  analytical: Microscope,
  creative: Sparkles,
  practical: Wrench,
};

const ACCENT: Record<AgentId, { bar: string; ring: string; chip: string; icon: string }> = {
  analytical: {
    bar: "bg-[color:var(--navy)]",
    ring: "ring-[color:var(--navy)]/20",
    chip: "bg-[color:var(--navy)]/8 text-[color:var(--navy)]",
    icon: "text-[color:var(--navy)]",
  },
  creative: {
    bar: "bg-[color:var(--gold)]",
    ring: "ring-[color:var(--gold)]/30",
    chip: "bg-[color:var(--gold)]/12 text-[color:var(--gold)]",
    icon: "text-[color:var(--gold)]",
  },
  practical: {
    bar: "bg-emerald-700",
    ring: "ring-emerald-600/20",
    chip: "bg-emerald-700/8 text-emerald-800",
    icon: "text-emerald-700",
  },
};

function scoreColor(score: number) {
  if (score >= 85) return "bg-emerald-700 text-white";
  if (score >= 70) return "bg-[color:var(--gold)] text-[color:var(--navy)]";
  if (score >= 50) return "bg-amber-600 text-white";
  return "bg-rose-700 text-white";
}

function AgentCardBase({ agent }: { agent: AgentCardState }) {
  const Icon = ICONS[agent.id];
  const accent = ACCENT[agent.id];
  const isRunning = agent.status === "running";
  const isDone = agent.status === "done";
  const isError = agent.status === "error";
  const hasContent = agent.content.length > 0;

  return (
    <div
      className={`relative flex h-full flex-col overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] shadow-sm transition-shadow hover:shadow-md ${accent.ring} ring-1`}
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${accent.bar}`} />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={`mt-0.5 shrink-0 ${accent.icon}`}>
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h3 className="font-serif-display text-base font-semibold leading-tight text-[color:var(--navy)] truncate">
              {agent.name}
            </h3>
            <p className="mt-0.5 text-[11px] leading-tight text-[color:var(--muted-foreground)] line-clamp-2">
              {agent.description}
            </p>
          </div>
        </div>

        {/* Status / score badge */}
        <div className="flex shrink-0 items-center gap-2">
          {agent.score !== undefined && (
            <div
              className={`score-pop flex h-9 w-9 flex-col items-center justify-center rounded-md text-xs font-bold ${scoreColor(agent.score)}`}
              title={agent.rationale}
            >
              <span className="leading-none">{agent.score}</span>
              <span className="text-[8px] font-medium opacity-80 leading-none mt-0.5">/100</span>
            </div>
          )}
          {isRunning && (
            <Loader2 className="h-4 w-4 animate-spin text-[color:var(--muted-foreground)]" />
          )}
          {isDone && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          {isError && (
            <AlertCircle className="h-4 w-4 text-rose-600" />
          )}
        </div>
      </div>

      {/* Meta row */}
      {(isDone || isRunning || isError) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-[color:var(--border)] bg-[color:var(--cream)]/40">
          {isRunning && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${accent.chip}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              responding
            </span>
          )}
          {isDone && (
            <>
              <span className="inline-flex items-center rounded-full bg-[color:var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)]">
                {agent.latencyMs >= 1000
                  ? `${(agent.latencyMs / 1000).toFixed(1)}s`
                  : `${agent.latencyMs}ms`}
              </span>
              <span className="inline-flex items-center rounded-full bg-[color:var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--muted-foreground)]">
                {agent.tokens} tok
              </span>
            </>
          )}
          {isError && (
            <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
              error
            </span>
          )}
          <div className="ml-auto">
            <CopyButton text={agent.content} label="" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="custom-scroll flex-1 max-h-[520px] min-h-[160px] overflow-y-auto px-4 py-3">
        {hasContent ? (
          <Markdown content={agent.content} streaming={isRunning} />
        ) : isRunning ? (
          <div className="flex items-center gap-2 text-sm text-[color:var(--muted-foreground)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Thinking…</span>
          </div>
        ) : isError ? (
          <p className="text-sm text-rose-600">{agent.error ?? "Something went wrong."}</p>
        ) : (
          <p className="text-sm text-[color:var(--muted-foreground)] italic">
            Awaiting prompt…
          </p>
        )}
      </div>

      {/* Rationale footer (appears after scoring) */}
      {agent.rationale && agent.score !== undefined && (
        <div className="border-t border-[color:var(--border)] bg-[color:var(--cream)]/60 px-4 py-2">
          <p className="text-[11px] leading-snug text-[color:var(--muted-foreground)]">
            <span className="font-semibold text-[color:var(--navy)]">Reviewer: </span>
            {agent.rationale}
          </p>
        </div>
      )}
    </div>
  );
}

export const AgentCard = memo(AgentCardBase);
