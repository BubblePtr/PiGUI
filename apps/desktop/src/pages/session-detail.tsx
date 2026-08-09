import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { PiKpi } from "@/shared/ui/pi-kpi";
import {
  PiTraceLedger,
  type TraceLedgerEntry,
  type TraceLedgerGroup,
} from "@/shared/ui/pi-trace-ledger";
import { toolTargetFromArgs } from "@/shared/ui/chat/chat-tool";
import { ChatCodeBlock } from "@/shared/ui/chat/chat-code-block";
import { useMemo, useRef } from "react";
import { ArrowLeft } from "@/shared/ui/icons";
import { invoke } from "@/shared/runtime";
import type {
  MessageRole,
  SessionContentPart,
  TokenUsage,
  CostBreakdown,
  SessionTurn,
  SessionDetail,
} from "@pigui/core";

export type {
  SessionContentPart,
  TokenUsage,
  CostBreakdown,
  SessionTurn,
  SessionDetail,
} from "@pigui/core";

const highlightedCodeBlockMaxChars = 4000;
const targetMaxChars = 120;

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

function firstNonEmptyLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function compactText(value: string, maxLength = targetMaxChars) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function turnLabel(turn: SessionTurn) {
  return turn.kind === "annotation" ? turn.title ?? "Annotation" : roleLabels[turn.role ?? "unknown"];
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

  return <ChatCodeBlock code={code} language="plaintext" />;
}

/**
 * Ledger mapping. One tool invocation = one row: the toolCall part opens the
 * row, the matching toolResult (paired by toolCallId, falling back to call
 * order) supplies status, duration, and output. Everything else maps 1:1.
 */
type ToolRowDraft = {
  id: string;
  callId?: string;
  name?: string;
  argsText?: string;
  output?: string;
  hasResult: boolean;
  isError?: boolean;
  durationMs?: number;
};

type EntryDraft =
  | { type: "tool"; tool: ToolRowDraft }
  | { type: "part"; id: string; part: SessionContentPart };

function toolArgsText(part: SessionContentPart) {
  const args = payloadValue(part, "arguments") ?? payloadValue(part, "input");
  return args === undefined ? undefined : formatValue(args);
}

function draftsFromParts(parts: SessionContentPart[], turnKey: string): EntryDraft[] {
  const drafts: EntryDraft[] = [];
  const openToolCalls: ToolRowDraft[] = [];

  parts.forEach((part, index) => {
    const id = `${turnKey}-${index}`;

    if (part.partType === "toolCall") {
      const argsText = toolArgsText(part);
      const tool: ToolRowDraft = {
        id,
        callId: payloadString(part, "id"),
        name: part.name ?? payloadString(part, "name"),
        argsText,
        hasResult: false,
      };
      openToolCalls.push(tool);
      drafts.push({ type: "tool", tool });
      return;
    }

    if (part.partType === "toolResult") {
      const callId = payloadString(part, "toolCallId");
      const match =
        openToolCalls.find((tool) => !tool.hasResult && callId && tool.callId === callId) ??
        openToolCalls.find((tool) => !tool.hasResult);

      const tool = match ?? {
        id,
        name: part.name,
        hasResult: false,
      };
      tool.hasResult = true;
      tool.output = part.text ?? formatValue(part.payload);
      tool.isError = part.isError;
      tool.durationMs = part.durationMs;

      if (!match) {
        drafts.push({ type: "tool", tool });
      }
      return;
    }

    drafts.push({ type: "part", id, part });
  });

  return drafts;
}

function toolEntry(tool: ToolRowDraft): TraceLedgerEntry {
  const hasDetail = tool.argsText !== undefined || tool.output !== undefined;

  return {
    id: tool.id,
    kind: "tool",
    name: tool.name,
    target: toolTargetFromArgs(tool.argsText),
    durationMs: tool.durationMs,
    status: tool.hasResult ? (tool.isError ? "error" : "ok") : undefined,
    detail: hasDetail ? (
      <>
        {tool.argsText !== undefined ? <LogCodeBlock>{tool.argsText}</LogCodeBlock> : null}
        {tool.output !== undefined ? <LogCodeBlock>{tool.output}</LogCodeBlock> : null}
      </>
    ) : undefined,
  };
}

function partEntry(id: string, part: SessionContentPart): TraceLedgerEntry {
  if (part.partType === "image") {
    const imageUrl = payloadString(part, "url");
    const imageAlt = payloadString(part, "alt");

    return {
      id,
      kind: "image",
      target: imageAlt ?? imageUrl,
      detail: imageUrl ? (
        <img
          src={imageUrl}
          alt={imageAlt ?? "Session image"}
          className="max-h-56 max-w-full rounded-md border border-border object-contain"
          loading="lazy"
        />
      ) : (
        <LogCodeBlock>{formatValue(part.payload)}</LogCodeBlock>
      ),
    };
  }

  const text = part.text ?? formatValue(part.payload);
  const target = text ? compactText(firstNonEmptyLine(text) ?? "") : undefined;
  const fitsInline = target !== undefined && text.trim() === target;
  const kind = part.partType === "thinking" ? "think" : part.partType;

  return {
    id,
    kind,
    name: part.name,
    target,
    detail: text && !fitsInline ? <LogCodeBlock>{text}</LogCodeBlock> : undefined,
  };
}

// The group header already names the annotation ("Model changed"); the row
// carries a stable generic kind and surfaces the new value in the name column.
function annotationEntries(turn: SessionTurn, turnKey: string): TraceLedgerEntry[] {
  return turn.parts.map((part, index) => ({
    id: `${turnKey}-${index}`,
    kind: "config",
    name: turn.model,
    detail:
      part.payload === undefined || part.payload === null ? undefined : (
        <LogCodeBlock>{formatValue(part.payload)}</LogCodeBlock>
      ),
  }));
}

function metaFromTurn(turn: SessionTurn) {
  if (!turn.usage && !turn.cost) {
    return undefined;
  }

  return `${formatCost(turn.cost?.totalUsd ?? 0)} · ${formatTokens(turn.usage?.totalTokens ?? 0)} tokens`;
}

export function ledgerGroupsFromTurns(turns: SessionTurn[]): TraceLedgerGroup[] {
  return turns.map((turn, index) => {
    const turnKey = `${turn.timestamp ?? "turn"}-${index}`;

    return {
      id: turnKey,
      label: turnLabel(turn),
      timestamp: turn.timestamp,
      meta: metaFromTurn(turn),
      entries:
        turn.kind === "annotation"
          ? annotationEntries(turn, turnKey)
          : draftsFromParts(turn.parts, turnKey).map((draft) =>
              draft.type === "tool" ? toolEntry(draft.tool) : partEntry(draft.id, draft.part),
            ),
    };
  });
}

export function SessionTimeline({ turns }: { turns: SessionTurn[] }) {
  const groups = useMemo(() => ledgerGroupsFromTurns(turns), [turns]);
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    measureElement: (element) => element.getBoundingClientRect().height || 120,
    overscan: 6,
    getItemKey: (index) => groups[index].id,
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
      <PiTraceLedger>
        <ol
          className="relative"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <li
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <PiTraceLedger.Group group={groups[virtualRow.index]} />
            </li>
          ))}
        </ol>
      </PiTraceLedger>
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
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-6 pt-6"
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
              Trace
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

        <div
          className="pigui-scroll-fade min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1"
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
                <PiKpi
                  formatOptions={{
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 6,
                  }}
                  label="Total cost"
                  layout="inline"
                  value={session.totalCostUsd}
                  valueClassName="min-w-0 max-w-full truncate text-right"
                />
                <PiKpi
                  formatOptions={{ notation: "compact", maximumFractionDigits: 1 }}
                  label="Total tokens"
                  layout="inline"
                  value={session.totalTokens}
                  valueClassName="min-w-0 max-w-full truncate text-right"
                />
                <PiKpi
                  label="Primary model"
                  layout="inline"
                  valueClassName="min-w-0 max-w-full truncate text-right"
                  valueTestId="session-primary-model-value"
                >
                  {session.primaryModel ?? "Unknown model"}
                </PiKpi>
                <PiKpi
                  label="Turns"
                  layout="inline"
                  value={session.turnCount}
                  valueClassName="min-w-0 max-w-full truncate text-right"
                />
                <PiKpi
                  label="Duration"
                  layout="inline"
                  valueClassName="min-w-0 max-w-full truncate text-right"
                >
                  {formatDuration(session.durationSeconds)}
                </PiKpi>
              </div>
            </section>
          ) : null}

          {/* Dense data sits flat on the page — the ledger's own group
              dividers carry the structure, no Card shell. */}
          <div className="mt-6">
            {isLoading ? (
              <EmptyState className="px-4 py-12" isCompact title="Loading session..." />
            ) : isError ? (
              <EmptyState className="px-4 py-12" isCompact title="Could not read this session." />
            ) : !session || session.turns.length === 0 ? (
              <EmptyState className="px-4 py-12" isCompact title="No timeline entries found." />
            ) : (
              <SessionTimeline turns={session.turns} />
            )}
          </div>
        </div>
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
