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

const exactTokens = new Intl.NumberFormat();

// Only the alarms paint; the calm states inherit the composer footer's own
// muted colour so the line reads as one hint until the context fills up.
const levelClassNames: Record<ContextUsageLevel, string> = {
  compacting: "",
  unknown: "",
  normal: "",
  warning: "text-warning",
  critical: "text-danger",
};

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
 * Spelled-out occupancy for the tooltip: the exact counts a hover is expected
 * to reveal, behind the rounded share the line shows at a glance.
 */
function usageDetail(usage: RuntimeContextUsage | null, isCompacting: boolean) {
  const tokens = usage
    ? `Context ${
        usage.tokens === null ? "?" : exactTokens.format(usage.tokens)
      }/${exactTokens.format(usage.contextWindow)} tokens`
    : "Context usage not reported yet";

  return isCompacting ? `${tokens} · Compacting…` : tokens;
}

/**
 * Context-window occupancy as one line of text on the composer footer, in Pi's
 * own `45%/200K` notation. An unknown token count — before the first response,
 * or between a compaction and the next one — reads `?`, never a fabricated
 * zero, and a running compaction says so instead of showing a share we no
 * longer hold.
 */
export function ContextUsageMeter({
  usage,
  isCompacting = false,
}: ContextUsageMeterProps) {
  const percent = usage?.percent ?? null;
  const level = usageLevel(percent, isCompacting);
  const share = percent === null ? "?" : `${Math.round(percent)}%`;
  const contextWindow = usage
    ? `/${compactTokens.format(usage.contextWindow)}`
    : "";

  return (
    <Tooltip content={usageDetail(usage, isCompacting)}>
      <span
        className={`whitespace-nowrap tabular-nums ${levelClassNames[level]}`.trim()}
        data-level={level}
        data-slot="context-usage-meter"
      >
        {isCompacting ? "Compacting…" : `Context ${share}${contextWindow}`}
      </span>
    </Tooltip>
  );
}
