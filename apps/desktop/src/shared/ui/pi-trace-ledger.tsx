import type { ReactNode } from "react";
import { formatToolDuration } from "@/shared/ui/chat/chat-tool";
import type { TraceRole, TraceRun, TraceStep } from "@/entities/session/trace-model";

/**
 * The Ledger (Trace Cockpit step list): one row per step, grouped two
 * levels deep — a sticky Run header per Active Run, a gutter dot at each
 * Turn boundary (one assistant message = one model call + its tools).
 * Rows carry a type badge and read `name {request} → result`; they never
 * expand inline — full payloads belong to the Inspector. Validated in the
 * trace-cockpit prototype round (2026-08-18).
 */

export type TraceStepType = { label: string; color: string };

/**
 * Four badges only — think/image/text collapse into ASSISTANT (all model
 * actions); an image step inherits its carrier's role (user upload → USER,
 * model-generated → ASSISTANT). Tool-produced images never become image
 * steps: the parser keeps them inside the toolResult payload, so they belong
 * to the TOOL row and surface in the Inspector.
 */
export function traceStepType(step: TraceStep, role: TraceRole): TraceStepType {
  if (role === "annotation" || step.kind === "config") {
    return { label: "context", color: "var(--success)" };
  }
  if (step.kind === "tool") {
    return { label: "tool", color: "var(--pigui-data-orange)" };
  }
  if (role === "user") {
    return { label: "user", color: "var(--pigui-data-blue)" };
  }
  return { label: "assistant", color: "var(--pigui-data-slate)" };
}

export function traceStepStatus(step: TraceStep): {
  glyph: string;
  className: string;
  label: string;
} {
  if (step.kind !== "tool") {
    return { glyph: "·", className: "text-muted", label: "—" };
  }
  if (step.isRunning) {
    return { glyph: "●", className: "animate-pulse text-primary", label: "Running" };
  }
  if (step.isError) {
    return { glyph: "✕", className: "text-danger", label: "Error" };
  }
  return { glyph: "✓", className: "text-success", label: "Completed" };
}

export function TraceStepBadge({ type }: { type: TraceStepType }) {
  return (
    <span
      className="inline-flex rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider"
      data-slot="trace-step-badge"
      style={{
        background: `color-mix(in oklch, ${type.color} 16%, transparent)`,
        color: `color-mix(in oklch, ${type.color} 72%, var(--foreground))`,
      }}
    >
      {type.label}
    </span>
  );
}

function compactJson(value?: string, max = 72) {
  if (!value) {
    return undefined;
  }
  let compact = value;
  try {
    compact = JSON.stringify(JSON.parse(value));
  } catch {
    compact = value.replace(/\s+/g, " ");
  }
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function firstLinePreview(value?: string, max = 110) {
  if (!value) {
    return undefined;
  }
  const line =
    value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean) ?? "";
  const compact = line.replace(/\s+/g, " ");
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function formatHeaderTime(value?: string) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(date);
}

function formatTokens(value?: number) {
  if (value === undefined) {
    return undefined;
  }
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function LedgerRow({
  step,
  role,
  isSelected,
  onSelect,
  rowRef,
}: {
  step: TraceStep;
  role: TraceRole;
  isSelected: boolean;
  onSelect?: (stepId: string) => void;
  rowRef?: (stepId: string, element: HTMLButtonElement | null) => void;
}) {
  const type = traceStepType(step, role);
  const request =
    step.kind === "tool"
      ? compactJson(step.argsText)
      : step.kind === "config"
        ? [step.target, step.name, compactJson(step.text)].filter(Boolean).join(" · ")
        : firstLinePreview(step.text ?? step.target);
  const result =
    step.kind === "tool"
      ? step.isRunning
        ? "running…"
        : firstLinePreview(step.output)
      : undefined;

  return (
    <button
      aria-pressed={isSelected}
      data-slot="trace-ledger-row"
      data-kind={step.kind}
      data-status={step.kind === "tool" ? (step.isRunning ? "running" : step.isError ? "error" : "ok") : undefined}
      data-playhead={isSelected ? "" : undefined}
      className={`grid w-full min-w-0 cursor-pointer grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-baseline gap-x-2 border-l-2 py-1 pl-2 pr-3 text-left font-mono text-xs leading-6 transition-colors ${
        isSelected ? "border-primary bg-surface-muted" : "border-transparent hover:bg-surface-hover"
      }`}
      ref={(element) => rowRef?.(step.id, element)}
      type="button"
      onClick={() => onSelect?.(step.id)}
    >
      <span className="flex justify-end">
        <TraceStepBadge type={type} />
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        {step.kind === "tool" ? (
          <>
            <span className="shrink-0 font-semibold text-foreground">{step.name}</span>
            {request ? (
              <span className="min-w-0 max-w-[45%] truncate text-muted">{request}</span>
            ) : null}
            <span aria-hidden="true" className="shrink-0 text-muted/60">
              →
            </span>
            <span
              className={`min-w-0 flex-1 truncate ${
                step.isError
                  ? "font-semibold text-danger"
                  : step.isRunning
                    ? "animate-pulse text-primary"
                    : "text-muted"
              }`}
            >
              {step.isError ? (firstLinePreview(step.output) ?? "Error") : (result ?? "—")}
            </span>
          </>
        ) : (
          <span
            className={`min-w-0 flex-1 truncate ${
              step.kind === "think" ? "text-muted" : "text-foreground"
            }`}
          >
            {request ?? step.name ?? "—"}
          </span>
        )}
      </span>
      <span className="text-right tabular-nums text-muted">
        {formatToolDuration(step.durationMs)}
      </span>
    </button>
  );
}

export type PiTraceLedgerRunProps = {
  run: TraceRun;
  selectedStepId?: string;
  onSelectStep?: (stepId: string) => void;
  /** Focus semantics (Strip brush): dimmed runs stay rendered, greyed out. */
  isDimmed?: boolean;
  /** True filter: steps not passing it drop out of the ledger. */
  stepFilter?: (step: TraceStep) => boolean;
  registerStepRef?: (stepId: string, element: HTMLButtonElement | null) => void;
  registerTurnRef?: (turnIndex: number, element: HTMLDivElement | null) => void;
};

function Run({
  run,
  selectedStepId,
  onSelectStep,
  isDimmed = false,
  stepFilter,
  registerStepRef,
  registerTurnRef,
}: PiTraceLedgerRunProps) {
  const visibleTurns = run.turns
    .map((turn) => ({
      turn,
      steps: stepFilter ? turn.steps.filter(stepFilter) : turn.steps,
    }))
    .filter(({ steps }) => steps.length > 0);

  if (visibleTurns.length === 0) {
    return null;
  }

  return (
    <section
      className={`transition-opacity ${isDimmed ? "opacity-30" : ""}`.trim()}
      data-focus-dimmed={isDimmed ? "" : undefined}
      data-slot="trace-ledger-run"
    >
      <header className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-t border-border bg-surface-muted/80 px-3 py-1 backdrop-blur">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-foreground">
            Run #{run.index + 1}
          </span>
          <time className="shrink-0 font-mono text-[11px] text-muted" dateTime={run.timestamp}>
            {formatHeaderTime(run.timestamp)}
          </time>
        </span>
        {run.totalTokens > 0 ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
            {formatTokens(run.totalTokens)} tok
          </span>
        ) : null}
      </header>
      {visibleTurns.map(({ turn, steps }) => (
        <div
          key={turn.index}
          ref={(element) => registerTurnRef?.(turn.index, element)}
        >
          {/* Turn boundary: each assistant message = one model call + its
              tools (glossary Turn). The gutter dot marks the model call. */}
          {turn.role === "assistant" || turn.role === "unknown" ? (
            <div
              aria-hidden="true"
              className="flex h-3 items-center"
              data-slot="trace-turn-boundary"
              title="Turn boundary — model called"
            >
              <span className="ml-[2.875rem] h-[5px] w-[5px] rounded-full bg-default/50" />
            </div>
          ) : null}
          {steps.map((step) => (
            <LedgerRow
              isSelected={step.id === selectedStepId}
              key={step.id}
              role={turn.role}
              rowRef={registerStepRef}
              step={step}
              onSelect={onSelectStep}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

export function PiTraceLedger({
  runs,
  emptyLabel = "No entries.",
  className = "",
  children,
  ...runProps
}: {
  runs?: TraceRun[];
  emptyLabel?: string;
  className?: string;
  /** Alternative to `runs`: render PiTraceLedger.Run rows yourself (virtualization). */
  children?: ReactNode;
} & Omit<PiTraceLedgerRunProps, "run">) {
  const isEmpty = !children && (runs?.length ?? 0) === 0;

  return (
    <div className={`font-mono text-xs ${className}`.trim()} data-slot="trace-ledger">
      {isEmpty ? (
        <p className="px-3 py-8 text-center text-muted">{emptyLabel}</p>
      ) : (
        (children ?? runs?.map((run) => <Run key={run.index} run={run} {...runProps} />))
      )}
    </div>
  );
}

PiTraceLedger.Run = Run;
