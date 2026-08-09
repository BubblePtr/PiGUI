import { useState, type ReactNode } from "react";
import { formatToolDuration } from "@/shared/ui/chat/chat-tool";

/**
 * Ledger-shaped trace view: one monospace grid row per event, grouped by
 * turn with divider headers. Validated in the chain-of-thought prototype
 * round (.scratch/cot-variants/PRD.md) as the Trace-page form — dense,
 * scannable, failures pop. Purely presentational: pages map their own
 * event shapes (historical SessionTurn today, live runtime events later —
 * the entry fields are the abstraction both share) into entries.
 */
export type TraceLedgerStatus = "ok" | "error" | "running";

export type TraceLedgerEntry = {
  id: string;
  /** Event class shown in the kind column, e.g. "tool" | "think" | "text". */
  kind: string;
  /** Actor within the kind, e.g. the tool name. */
  name?: string;
  /** What the event acted on or said — truncated to one line. */
  target?: string;
  durationMs?: number;
  status?: TraceLedgerStatus;
  /** Expandable payload; rows without it render static. */
  detail?: ReactNode;
};

export type TraceLedgerGroup = {
  id: string;
  label: string;
  timestamp?: string;
  /** Free-form right-aligned header annotation, e.g. cost + tokens. */
  meta?: string;
  entries: TraceLedgerEntry[];
};

// One shared template keeps columns aligned across independently rendered
// (and virtualized) groups.
const rowGridClassName =
  "grid w-full min-w-0 grid-cols-[1.25rem_3.5rem_minmax(4rem,9rem)_minmax(0,1fr)_4.5rem] items-baseline gap-x-3";

const statusGlyphs: Record<TraceLedgerStatus, string> = {
  ok: "✓",
  error: "✕",
  running: "●",
};

const statusGlyphClassNames: Record<TraceLedgerStatus, string> = {
  ok: "text-success",
  error: "text-danger",
  running: "animate-pulse text-primary",
};

function formatGroupTime(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(timestamp);
}

function RowColumns({ entry }: { entry: TraceLedgerEntry }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`text-center ${entry.status ? statusGlyphClassNames[entry.status] : "text-muted"}`}
        data-slot="trace-ledger-glyph"
      >
        {entry.status ? statusGlyphs[entry.status] : "·"}
      </span>
      <span className="truncate text-muted">{entry.kind}</span>
      <span className="truncate text-foreground">{entry.name}</span>
      <span className="truncate text-muted">{entry.target}</span>
      <span className="text-right tabular-nums text-muted">
        {formatToolDuration(entry.durationMs)}
      </span>
    </>
  );
}

function LedgerRow({ entry }: { entry: TraceLedgerEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const rowAttributes = {
    "data-slot": "trace-ledger-row",
    "data-kind": entry.kind,
    "data-status": entry.status,
  };

  if (!entry.detail) {
    return (
      <div {...rowAttributes} className={`${rowGridClassName} px-3 py-1`}>
        <RowColumns entry={entry} />
      </div>
    );
  }

  // Detail stays unmounted until expanded — sessions carry megabyte-scale
  // tool outputs and mounting them for every visible row would defeat the
  // page's virtualization.
  return (
    <div {...rowAttributes}>
      <button
        aria-expanded={isExpanded}
        className={`${rowGridClassName} cursor-pointer text-left transition-colors hover:bg-surface-hover px-3 py-1`}
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
      >
        <RowColumns entry={entry} />
      </button>
      {isExpanded ? (
        <div
          className="mx-3 mb-2 overflow-x-auto rounded-md bg-surface-muted px-3 py-2 [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
          data-slot="trace-ledger-detail"
        >
          {entry.detail}
        </div>
      ) : null}
    </div>
  );
}

function Group({ group }: { group: TraceLedgerGroup }) {
  const time = group.timestamp ? formatGroupTime(group.timestamp) : undefined;

  return (
    <section data-slot="trace-ledger-group">
      <header className="flex items-baseline justify-between gap-3 border-t border-border bg-surface-muted/50 px-3 py-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-semibold text-foreground">{group.label}</span>
          {time ? (
            <time className="shrink-0 text-muted" dateTime={group.timestamp}>
              {time}
            </time>
          ) : null}
        </span>
        {group.meta ? (
          <span className="shrink-0 tabular-nums text-muted">{group.meta}</span>
        ) : null}
      </header>
      {group.entries.map((entry) => (
        <LedgerRow entry={entry} key={entry.id} />
      ))}
    </section>
  );
}

export function PiTraceLedger({
  groups,
  emptyLabel = "No entries.",
  className = "",
  children,
}: {
  groups?: TraceLedgerGroup[];
  emptyLabel?: string;
  className?: string;
  /** Alternative to `groups`: render PiTraceLedger.Group rows yourself (virtualization). */
  children?: ReactNode;
}) {
  const isEmpty = !children && (groups?.length ?? 0) === 0;

  return (
    <div
      className={`font-mono text-xs leading-6 ${className}`.trim()}
      data-slot="trace-ledger"
    >
      {isEmpty ? (
        <p className="px-3 py-8 text-center text-muted">{emptyLabel}</p>
      ) : (
        children ?? groups?.map((group) => <Group group={group} key={group.id} />)
      )}
    </div>
  );
}

PiTraceLedger.Group = Group;
