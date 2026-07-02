"use client";

import ReactMarkdown from "react-markdown";
import { Copy, Check } from "lucide-react";
import { useState, memo } from "react";

interface MarkdownProps {
  content: string;
  /** When true, shows a blinking cursor at the end (for active streaming). */
  streaming?: boolean;
  className?: string;
}

/**
 * Lightweight markdown renderer used inside agent cards and the review panel.
 * Renders code blocks in a styled <pre>. Kept dependency-free of syntax
 * highlighting to keep the streaming UI fast and visually consistent with
 * the academic theme.
 */
function MarkdownBase({ content, streaming = false, className = "" }: MarkdownProps) {
  return (
    <div
      className={`prose prose-sm max-w-none prose-headings:font-serif-display prose-headings:font-semibold prose-headings:text-[color:var(--navy)] prose-p:leading-relaxed prose-p:text-[color:var(--ink)] prose-strong:text-[color:var(--navy)] prose-code:rounded prose-code:bg-[color:var(--gold-soft)] prose-code:px-1 prose-code:py-0.5 prose-code:text-[color:var(--navy)] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[color:var(--navy)] prose-pre:text-[color:var(--cream)] prose-pre:rounded-md prose-blockquote:border-l-[color:var(--gold)] prose-blockquote:text-[color:var(--muted-foreground)] prose-a:text-[color:var(--gold)] prose-li:marker:text-[color:var(--gold)] ${streaming ? "stream-cursor" : ""} ${className}`}
    >
      <ReactMarkdown
        components={{
          pre: ({ children }) => (
            <pre className="overflow-x-auto custom-scroll rounded-md p-3 text-xs">
              {children}
            </pre>
          ),
          code: ({ className: cls, children, ...props }) => {
            const isBlock = /language-/.test(cls ?? "");
            if (isBlock) {
              return <code className={cls} {...props}>{children}</code>;
            }
            return <code className={cls} {...props}>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownBase);

/** A copy button that copies arbitrary text with a brief "Copied!" state. */
export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-2.5 py-1 text-xs font-medium text-[color:var(--muted-foreground)] transition-colors hover:border-[color:var(--gold)] hover:text-[color:var(--navy)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-[color:var(--gold)]" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
