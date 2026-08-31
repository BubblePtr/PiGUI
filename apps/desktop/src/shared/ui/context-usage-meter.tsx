import { Tooltip } from "@astryxdesign/core/Tooltip";
import type { RuntimeContextUsage } from "@pigui/core";

// Pi's own footer paints the context share amber past 70% and red past 90%;
// PiGUI mirrors those thresholds so both surfaces alarm at the same moment.
const WARNING_PERCENT = 70;
const CRITICAL_PERCENT = 90;

type ContextUsageLevel = "compacting" | "unknown" | "normal" | "warning" | "critical";

export type ContextUsageMeterProps = {
  /** Live occupancy; null until the runtime has reported any. */
  usage: RuntimeContextUsage | null;
  /** A compaction is running — the count is in flight, not one we hold. */
  isCompacting?: boolean;
};

const compactTokens = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

// Traffic-light health semantics: green while the context length is in good
// shape, amber when it has grown enough that a proactive compaction is worth
// considering, red when the window limit — and a forced compaction — is near.
const levelClassNames: Record<ContextUsageLevel, string> = {
  compacting: "text-primary",
  unknown: "text-muted",
  // The data-* palette, not text tokens: `--success`/`--warning` are darkened
  // for text contrast in light mode, which reads muddy on a 2px graphic arc.
  normal: "text-[var(--pigui-data-green)]",
  warning: "text-[var(--pigui-data-amber)]",
  critical: "text-[var(--pigui-data-orange-strong)]",
};

const RING_SIZE = 14;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function usageLevel(percent: number | null, isCompacting: boolean): ContextUsageLevel {
  if (isCompacting) {
    return "compacting";
  }

  if (percent === null) {
    return "unknown";
  }

  if (percent > CRITICAL_PERCENT) {
    return "critical";
  }

  return percent > WARNING_PERCENT ? "warning" : "normal";
}

/**
 * Readout for the tooltip and the ring's accessible name — the ring alone
 * carries no text, so this single string is everything a hover, or a screen
 * reader, learns: the share plus the window it is a share of (`45% · 200K`).
 */
function usageDetail(usage: RuntimeContextUsage | null, isCompacting: boolean) {
  if (!usage) {
    return "Context usage not reported yet";
  }

  const window = compactTokens.format(usage.contextWindow);

  // A compaction invalidates the share we held; say so instead of showing it.
  if (isCompacting) {
    return `Compacting… · ${window}`;
  }

  const share = usage.percent === null ? "?" : `${Math.round(usage.percent)}%`;

  return `Context ${share} · ${window}`;
}

/**
 * Context-window occupancy as a small ring on the composer footer: the arc is
 * the occupied share, quiet in the accent colour until Pi's 70%/90% alarms
 * repaint it. An unknown count draws the empty track rather than a fabricated
 * arc, and a running compaction spins instead of showing a share we no longer
 * hold. All numbers live in the tooltip and the accessible name.
 */
export function ContextUsageMeter({
  usage,
  isCompacting = false,
}: ContextUsageMeterProps) {
  const percent = usage?.percent ?? null;
  const level = usageLevel(percent, isCompacting);
  const detail = usageDetail(usage, isCompacting);
  // A compacting spinner shows a fixed quarter arc; otherwise the real share.
  const arcPercent = isCompacting ? 25 : percent ?? 0;
  const arcLength = (Math.min(Math.max(arcPercent, 0), 100) / 100) * RING_CIRCUMFERENCE;

  return (
    <Tooltip content={detail}>
      <span
        aria-label={detail}
        className={`inline-flex ${levelClassNames[level]}`}
        data-level={level}
        data-slot="context-usage-meter"
        role="img"
      >
        <svg
          aria-hidden="true"
          className={isCompacting ? "animate-spin motion-reduce:animate-none" : undefined}
          fill="none"
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          width={RING_SIZE}
        >
          <circle
            className="opacity-25"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke="currentColor"
            strokeWidth={RING_STROKE}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke="currentColor"
            strokeDasharray={`${arcLength} ${RING_CIRCUMFERENCE}`}
            strokeLinecap="round"
            strokeWidth={RING_STROKE}
            // Start the arc at 12 o'clock, like every clock-shaped gauge.
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </svg>
      </span>
    </Tooltip>
  );
}
