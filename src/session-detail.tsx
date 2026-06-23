import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Settings2,
  Terminal,
  User,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

type MessageRole = "user" | "assistant" | "toolResult" | "unknown";

export type SessionContentPart = {
  partType: string;
  text?: string;
  name?: string;
  payload: unknown;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

export type CostBreakdown = {
  inputUsd: number;
  outputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  totalUsd: number;
};

export type SessionTurn = {
  kind: "message" | "annotation";
  role?: MessageRole;
  timestamp?: string;
  title?: string;
  model?: string;
  usage?: TokenUsage;
  cost?: CostBreakdown;
  parts: SessionContentPart[];
};

export type SessionDetail = {
  id: string;
  timestamp: string;
  project: string;
  totalCostUsd: number;
  totalTokens: number;
  primaryModel?: string;
  turnCount: number;
  durationSeconds?: number;
  turns: SessionTurn[];
};

const thinkingPreviewLines = 6;
const thinkingPreviewChars = 1200;

const roleLabels: Record<MessageRole, string> = {
  user: "User",
  assistant: "Assistant",
  toolResult: "Tool result",
  unknown: "Message",
};

function formatTimestamp(value?: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatCost(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatTokens(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDuration(seconds?: number) {
  if (seconds === undefined) {
    return "Unknown";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) {
    return `${remainder}s`;
  }

  return `${minutes}m ${remainder}s`;
}

function getSessionDetail(sessionId: string) {
  return invoke<SessionDetail>("get_session_detail", { id: sessionId });
}

function payloadValue(part: SessionContentPart, key: string) {
  if (!part.payload || typeof part.payload !== "object") {
    return undefined;
  }

  return (part.payload as Record<string, unknown>)[key];
}

function payloadString(part: SessionContentPart, key: string) {
  const value = payloadValue(part, key);
  return typeof value === "string" ? value : undefined;
}

function formatValue(value: unknown) {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function partLabel(partType: string) {
  switch (partType) {
    case "thinking":
      return "Thinking";
    case "toolCall":
      return "Tool call";
    case "toolResult":
      return "Tool result";
    case "image":
      return "Image";
    case "text":
      return "Text";
    default:
      return partType;
  }
}

function firstNonEmptyLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function compactText(value: string, maxLength = 180) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function partSummary(part: SessionContentPart) {
  if (part.partType === "toolCall") {
    return part.name ? `Called ${part.name}` : "Called a tool";
  }

  if (part.partType === "toolResult") {
    return part.name ? `Received ${part.name} output` : "Received tool output";
  }

  if (part.partType === "image") {
    return payloadString(part, "alt") ?? payloadString(part, "url") ?? "Rendered an image";
  }

  const text = part.text ? firstNonEmptyLine(part.text) : undefined;
  if (text) {
    return compactText(text);
  }

  return partLabel(part.partType);
}

function turnLabel(turn: SessionTurn) {
  return turn.kind === "annotation" ? turn.title ?? "Annotation" : roleLabels[turn.role ?? "unknown"];
}

function turnSummary(turn: SessionTurn) {
  for (const part of turn.parts) {
    const summary = partSummary(part);
    if (summary) {
      return summary;
    }
  }

  return "No content.";
}

function previewThinking(value: string) {
  const lines = value.split(/\r?\n/);
  const linePreview = lines.slice(0, thinkingPreviewLines).join("\n");
  const preview =
    linePreview.length > thinkingPreviewChars
      ? `${linePreview.slice(0, thinkingPreviewChars).trimEnd()}...`
      : linePreview;

  return {
    preview,
    isTruncated: lines.length > thinkingPreviewLines || value.length > preview.length,
  };
}

function partFoldLabel(partType: string) {
  if (partType === "toolCall") {
    return "input";
  }

  if (partType === "toolResult") {
    return "output";
  }

  return "details";
}

function RoleIcon({ role }: { role?: MessageRole }) {
  if (role === "user") {
    return <User className="size-4" />;
  }
  if (role === "assistant") {
    return <Bot className="size-4" />;
  }
  if (role === "toolResult") {
    return <Terminal className="size-4" />;
  }
  return <Settings2 className="size-4" />;
}

function CostTokenBadge({ usage, cost }: { usage?: TokenUsage; cost?: CostBreakdown }) {
  if (!usage && !cost) {
    return null;
  }

  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-surface-muted px-2 py-1 text-xs font-medium text-muted">
      <span className="text-foreground">{formatCost(cost?.totalUsd ?? 0)}</span>
      <span>{formatTokens(usage?.totalTokens ?? 0)} tokens</span>
    </span>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase text-muted">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-foreground">{value}</div>
    </div>
  );
}

function FoldButton({
  expanded,
  onClick,
  children,
}: {
  expanded: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground"
    >
      {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      {children}
    </button>
  );
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-foreground">
      {children}
    </pre>
  );
}

function SessionPart({ part }: { part: SessionContentPart }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const imageUrl = payloadString(part, "url");
  const imageAlt = payloadString(part, "alt");
  const isFoldedByDefault = part.partType === "toolCall" || part.partType === "toolResult";
  const isThinking = part.partType === "thinking";
  const body = part.text ?? (isFoldedByDefault && !isExpanded ? "" : formatValue(part.payload));
  const thinking = isThinking ? previewThinking(body) : undefined;
  const shouldRenderBody = !isFoldedByDefault || isExpanded;

  return (
    <div className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium uppercase text-muted">
          {part.partType === "toolCall" ? <Wrench className="size-3.5" /> : null}
          {part.partType === "image" ? <ImageIcon className="size-3.5" /> : null}
          <span>{partLabel(part.partType)}</span>
          {part.name ? <span className="truncate normal-case text-foreground">{part.name}</span> : null}
        </div>

        {isFoldedByDefault ? (
          <FoldButton expanded={isExpanded} onClick={() => setIsExpanded((value) => !value)}>
            {isExpanded ? `Hide ${partFoldLabel(part.partType)}` : `Show ${partFoldLabel(part.partType)}`}
          </FoldButton>
        ) : null}
      </div>

      {part.partType === "toolCall" && shouldRenderBody ? (
        <CodeBlock>
          {part.name ? `name: ${part.name}\n` : ""}
          {payloadValue(part, "input") === undefined
            ? formatValue(part.payload)
            : `input: ${formatValue(payloadValue(part, "input"))}`}
        </CodeBlock>
      ) : part.partType === "image" ? (
        imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt ?? "Session image"}
            className="max-h-56 max-w-full rounded-md border border-border object-contain"
            loading="lazy"
          />
        ) : (
          <CodeBlock>{formatValue(part.payload)}</CodeBlock>
        )
      ) : isThinking && thinking ? (
        <>
          <CodeBlock>{isExpanded ? body : thinking.preview}</CodeBlock>
          {thinking.isTruncated ? (
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((value) => !value)}
              className="mt-2 inline-flex min-h-8 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground"
            >
              {isExpanded ? "Collapse thinking" : "Expand all"}
            </button>
          ) : null}
        </>
      ) : part.partType === "toolResult" && !shouldRenderBody ? (
        <div className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted">
          Tool output folded.
        </div>
      ) : (
        <CodeBlock>{body}</CodeBlock>
      )}
    </div>
  );
}

export function TimelineTurn({ turn }: { turn: SessionTurn }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const label = turnLabel(turn);

  return (
    <li className="grid gap-3 border-b border-border px-4 py-4 md:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-muted">
          <RoleIcon role={turn.role} />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{label}</span>
            <CostTokenBadge usage={turn.usage} cost={turn.cost} />
          </div>
          {turn.model ? (
            <div className="mt-1 truncate text-xs text-muted">{turn.model}</div>
          ) : null}
          {turn.timestamp ? (
            <time dateTime={turn.timestamp} className="mt-1 block text-xs text-muted">
              {formatTimestamp(turn.timestamp)}
            </time>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((value) => !value)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-4 py-3 text-left text-sm text-foreground transition hover:bg-surface-hover"
        >
          <span className="min-w-0 truncate">{turnSummary(turn)}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted">
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {isExpanded ? "Collapse" : "Expand"}
          </span>
        </button>

        {isExpanded ? (
          <div className="mt-2 min-w-0 overflow-hidden rounded-md border border-border bg-surface">
            {turn.parts.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted">No content.</div>
            ) : (
              turn.parts.map((part, index) => (
                <SessionPart key={`${part.partType}-${index}`} part={part} />
              ))
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function SessionTimeline({ turns }: { turns: SessionTurn[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: turns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 116,
    measureElement: (element) => element.getBoundingClientRect().height || 116,
    overscan: 6,
    getItemKey: (index) => `${turns[index].timestamp ?? "turn"}-${index}`,
    initialOffset: 0,
    initialRect: { width: 0, height: 720 },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) {
        callback({ width: 0, height: 720 });
        return () => {};
      }

      const observer = new ResizeObserver(() => {
        const rect = element.getBoundingClientRect();
        callback({
          width: rect.width || 0,
          height: rect.height || 720,
        });
      });
      observer.observe(element);
      return () => observer.disconnect();
    },
  });

  return (
    <div ref={parentRef} className="max-h-[72vh] overflow-auto" data-testid="timeline-viewport">
      <ol
        className="relative"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const turn = turns[virtualRow.index];

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <TimelineTurn turn={turn} />
            </div>
          );
        })}
      </ol>
    </div>
  );
}

export function SessionDetailView({
  session,
  sessionId,
  isLoading = false,
  isError = false,
}: {
  session?: SessionDetail;
  sessionId: string;
  isLoading?: boolean;
  isError?: boolean;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-6">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <Link
              to="/"
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Recent sessions
            </Link>
            <h1 className="truncate text-xl font-semibold tracking-normal">
              {session?.project ?? "Session"}
            </h1>
            <p className="mt-1 truncate text-sm text-muted">{sessionId}</p>
          </div>
          {session ? (
            <time
              dateTime={session.timestamp}
              className="shrink-0 text-sm font-medium text-muted"
            >
              {formatTimestamp(session.timestamp)}
            </time>
          ) : null}
        </header>

        {session ? (
          <section className="mt-6 rounded-md border border-border bg-surface p-4 shadow-sm">
            <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-border pb-3">
              <h2 className="text-sm font-semibold uppercase text-muted">Summary</h2>
              <span className="text-xs font-medium text-muted">Cost shown as API list price</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryItem label="Total cost" value={formatCost(session.totalCostUsd)} />
              <SummaryItem label="Total tokens" value={formatTokens(session.totalTokens)} />
              <SummaryItem label="Primary model" value={session.primaryModel ?? "Unknown model"} />
              <SummaryItem label="Turns" value={String(session.turnCount)} />
              <SummaryItem label="Duration" value={formatDuration(session.durationSeconds)} />
            </div>
          </section>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-md border border-border bg-surface shadow-sm">
          {isLoading ? (
            <div className="px-4 py-12 text-sm text-muted">Loading session...</div>
          ) : isError ? (
            <div className="px-4 py-12 text-sm text-danger">Could not read this session.</div>
          ) : !session || session.turns.length === 0 ? (
            <div className="px-4 py-12 text-sm text-muted">No timeline entries found.</div>
          ) : (
            <SessionTimeline turns={session.turns} />
          )}
        </section>
      </div>
    </main>
  );
}

export function SessionDetailPage() {
  const { sessionId } = useParams({ from: "/sessions/$sessionId" });
  const detail = useQuery({
    queryKey: ["session-detail", sessionId],
    queryFn: () => getSessionDetail(sessionId),
  });

  return (
    <SessionDetailView
      session={detail.data}
      sessionId={sessionId}
      isLoading={detail.isLoading}
      isError={detail.isError}
    />
  );
}
