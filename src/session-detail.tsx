import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button, Card, Chip, EmptyState as HeroEmptyState, ScrollShadow } from "@heroui/react";
import { KPI } from "@heroui-pro/react";
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
import { lazy, Suspense, useRef, useState } from "react";
import { invoke } from "./tauri-runtime";

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
const highlightedCodeBlockMaxChars = 4000;

const LazyHeroCodeBlock = lazy(async () => {
  const { CodeBlock } = await import("../vendor/herouipro-v3/src/components/code-block");

  return {
    default: function HighlightedCodeBlock({ code }: { code: string }) {
      return (
        <CodeBlock>
          <CodeBlock.Code code={code} language="plaintext" />
        </CodeBlock>
      );
    },
  };
});

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
    <Chip
      className="h-auto min-w-0 max-w-full whitespace-normal py-1"
      size="sm"
      variant="soft"
    >
      <Chip.Label className="flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-tight">
        <span className="min-w-0 max-w-full truncate text-foreground">
          {formatCost(cost?.totalUsd ?? 0)}
        </span>
        <span className="min-w-0 max-w-full truncate">
          {formatTokens(usage?.totalTokens ?? 0)} tokens
        </span>
      </Chip.Label>
    </Chip>
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
    <Button
      aria-expanded={expanded}
      className="min-h-8 gap-1.5 text-xs"
      size="sm"
      variant="outline"
      onPress={onClick}
    >
      {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      {children}
    </Button>
  );
}

function PlainLogCodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-foreground">
      {code}
    </pre>
  );
}

function LogCodeBlock({ children }: { children: string | string[] }) {
  const code = Array.isArray(children) ? children.join("") : children;

  if (code.length > highlightedCodeBlockMaxChars) {
    return <PlainLogCodeBlock code={code} />;
  }

  return (
    <Suspense fallback={<PlainLogCodeBlock code={code} />}>
      <LazyHeroCodeBlock code={code} />
    </Suspense>
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
        <LogCodeBlock>
          {part.name ? `name: ${part.name}\n` : ""}
          {payloadValue(part, "input") === undefined
            ? formatValue(part.payload)
            : `input: ${formatValue(payloadValue(part, "input"))}`}
        </LogCodeBlock>
      ) : part.partType === "image" ? (
        imageUrl ? (
          <img
            src={imageUrl}
            alt={imageAlt ?? "Session image"}
            className="max-h-56 max-w-full rounded-md border border-border object-contain"
            loading="lazy"
          />
        ) : (
          <LogCodeBlock>{formatValue(part.payload)}</LogCodeBlock>
        )
      ) : isThinking && thinking ? (
        <>
          <LogCodeBlock>{isExpanded ? body : thinking.preview}</LogCodeBlock>
          {thinking.isTruncated ? (
            <Button
              aria-expanded={isExpanded}
              className="mt-2 min-h-8 text-xs"
              size="sm"
              variant="outline"
              onPress={() => setIsExpanded((value) => !value)}
            >
              {isExpanded ? "Collapse thinking" : "Expand all"}
            </Button>
          ) : null}
        </>
      ) : part.partType === "toolResult" && !shouldRenderBody ? (
        <div className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted">
          Tool output folded.
        </div>
      ) : (
        <LogCodeBlock>{body}</LogCodeBlock>
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
        <Button
          aria-expanded={isExpanded}
          className="min-h-12 w-full justify-between gap-3 bg-surface-muted px-4 py-3 text-left text-sm text-foreground"
          variant="outline"
          onPress={() => setIsExpanded((value) => !value)}
        >
          <span className="min-w-0 truncate">{turnSummary(turn)}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted">
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {isExpanded ? "Collapse" : "Expand"}
          </span>
        </Button>

        {isExpanded ? (
          <Card className="mt-2 min-w-0 overflow-hidden">
            {turn.parts.length === 0 ? (
              <div className="px-4 py-3 text-sm text-muted">No content.</div>
            ) : (
              turn.parts.map((part, index) => (
                <SessionPart key={`${part.partType}-${index}`} part={part} />
              ))
            )}
          </Card>
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
    <article
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="session-detail-view"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <Link
              to="/"
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Analyze Trace
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

        <ScrollShadow
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1"
          data-testid="session-detail-scroll-body"
        >
          {session ? (
            <section className="mt-6">
              <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-border pb-3">
                <h2 className="text-sm font-semibold uppercase text-muted">Summary</h2>
                <span className="text-xs font-medium text-muted">Cost shown as API list price</span>
              </div>
              <div
                className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4"
                data-testid="session-summary-grid"
              >
                <KPI>
                  <KPI.Content className="min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
                    <KPI.Title>Total cost</KPI.Title>
                    <KPI.Value
                      className="min-w-0 max-w-full truncate text-right"
                      currency="USD"
                      maximumFractionDigits={6}
                      minimumFractionDigits={4}
                      style="currency"
                      value={session.totalCostUsd}
                    />
                  </KPI.Content>
                </KPI>
                <KPI>
                  <KPI.Content className="min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
                    <KPI.Title>Total tokens</KPI.Title>
                    <KPI.Value
                      className="min-w-0 max-w-full truncate text-right"
                      maximumFractionDigits={1}
                      notation="compact"
                      value={session.totalTokens}
                    />
                  </KPI.Content>
                </KPI>
                <KPI>
                  <KPI.Content className="min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
                    <KPI.Title>Primary model</KPI.Title>
                    <dd
                      className="mt-1 min-w-0 max-w-full truncate text-right text-base font-semibold text-foreground"
                      data-testid="session-primary-model-value"
                    >
                      {session.primaryModel ?? "Unknown model"}
                    </dd>
                  </KPI.Content>
                </KPI>
                <KPI>
                  <KPI.Content className="min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
                    <KPI.Title>Turns</KPI.Title>
                    <KPI.Value
                      className="min-w-0 max-w-full truncate text-right"
                      value={session.turnCount}
                    />
                  </KPI.Content>
                </KPI>
                <KPI>
                  <KPI.Content className="min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
                    <KPI.Title>Duration</KPI.Title>
                    <dd className="mt-1 min-w-0 max-w-full truncate text-right text-base font-semibold text-foreground">
                      {formatDuration(session.durationSeconds)}
                    </dd>
                  </KPI.Content>
                </KPI>
              </div>
            </section>
          ) : null}

          <Card className="mt-6 overflow-hidden">
            {isLoading ? (
              <HeroEmptyState className="px-4 py-12 text-sm text-muted">Loading session...</HeroEmptyState>
            ) : isError ? (
              <HeroEmptyState className="px-4 py-12 text-sm text-danger">
                Could not read this session.
              </HeroEmptyState>
            ) : !session || session.turns.length === 0 ? (
              <HeroEmptyState className="px-4 py-12 text-sm text-muted">
                No timeline entries found.
              </HeroEmptyState>
            ) : (
              <SessionTimeline turns={session.turns} />
            )}
          </Card>
        </ScrollShadow>
      </div>
    </article>
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
