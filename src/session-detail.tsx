import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, Bot, ImageIcon, Settings2, Terminal, User, Wrench } from "lucide-react";

type MessageRole = "user" | "assistant" | "toolResult" | "unknown";

type SessionContentPart = {
  partType: string;
  text?: string;
  name?: string;
  payload: unknown;
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

type CostBreakdown = {
  inputUsd: number;
  outputUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
  totalUsd: number;
};

type SessionTurn = {
  kind: "message" | "annotation";
  role?: MessageRole;
  timestamp?: string;
  title?: string;
  model?: string;
  usage?: TokenUsage;
  cost?: CostBreakdown;
  parts: SessionContentPart[];
};

type SessionDetail = {
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

function SessionPart({ part }: { part: SessionContentPart }) {
  const input = payloadValue(part, "input");
  const imageUrl = payloadString(part, "url");
  const imageAlt = payloadString(part, "alt");
  const body = part.text ?? formatValue(part.payload);

  return (
    <div className="border-t border-border px-4 py-3 first:border-t-0">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted">
        {part.partType === "toolCall" ? <Wrench className="size-3.5" /> : null}
        {part.partType === "image" ? <ImageIcon className="size-3.5" /> : null}
        <span>{partLabel(part.partType)}</span>
        {part.name ? <span className="normal-case text-foreground">{part.name}</span> : null}
      </div>

      {part.partType === "toolCall" ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-foreground">
          {part.name ? `name: ${part.name}\n` : ""}
          {input === undefined ? formatValue(part.payload) : `input: ${formatValue(input)}`}
        </pre>
      ) : part.partType === "image" ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-foreground">
          {[
            imageUrl ? `url: ${imageUrl}` : null,
            imageAlt ? `alt: ${imageAlt}` : null,
            !imageUrl && !imageAlt ? formatValue(part.payload) : null,
          ]
            .filter(Boolean)
            .join("\n")}
        </pre>
      ) : (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-muted px-3 py-2 text-sm leading-6 text-foreground">
          {body}
        </pre>
      )}
    </div>
  );
}

function TimelineTurn({ turn }: { turn: SessionTurn }) {
  const label = turn.kind === "annotation" ? turn.title ?? "Annotation" : roleLabels[turn.role ?? "unknown"];

  return (
    <li className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[10rem_minmax(0,1fr)]">
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

      <div className="min-w-0 overflow-hidden rounded-md border border-border bg-surface">
        {turn.parts.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted">No content.</div>
        ) : (
          turn.parts.map((part, index) => (
            <SessionPart key={`${part.partType}-${index}`} part={part} />
          ))
        )}
      </div>
    </li>
  );
}

export function SessionDetailPage() {
  const { sessionId } = useParams({ from: "/sessions/$sessionId" });
  const detail = useQuery({
    queryKey: ["session-detail", sessionId],
    queryFn: () => getSessionDetail(sessionId),
  });
  const session = detail.data;

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
          <section className="mt-6 rounded-lg border border-border bg-surface p-4 shadow-sm">
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

        <section className="mt-6 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {detail.isLoading ? (
            <div className="px-4 py-12 text-sm text-muted">Loading session...</div>
          ) : detail.isError ? (
            <div className="px-4 py-12 text-sm text-danger">Could not read this session.</div>
          ) : !session || session.turns.length === 0 ? (
            <div className="px-4 py-12 text-sm text-muted">No timeline entries found.</div>
          ) : (
            <ol>
              {session.turns.map((turn, index) => (
                <TimelineTurn key={`${turn.timestamp ?? "turn"}-${index}`} turn={turn} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
