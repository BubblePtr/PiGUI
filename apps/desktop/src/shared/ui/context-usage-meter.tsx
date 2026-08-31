import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
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

const levelVariants: Record<ContextUsageLevel, "accent" | "warning" | "error" | "neutral"> =
  {
    compacting: "accent",
    unknown: "neutral",
    normal: "accent",
    warning: "warning",
    critical: "error",
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
 * Context-window occupancy for the composer: a quiet bar plus Pi's own
 * `45%/200K` notation. An unknown token count — before the first response, or
 * between a compaction and the next one — reads `?`, never a fabricated zero.
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
    <div
      className="flex items-center gap-2"
      data-level={level}
      data-slot="context-usage-meter"
    >
      <span className="w-16">
        <ProgressBar
          isLabelHidden
          isIndeterminate={isCompacting}
          label="Context usage"
          value={percent ?? 0}
          variant={levelVariants[level]}
        />
      </span>
      <Text as="span" color="secondary" type="supporting">
        {isCompacting ? "Compacting…" : `${share}${contextWindow}`}
      </Text>
    </div>
  );
}
