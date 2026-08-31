import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
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
  /** `compact` fits the toolbar row: the share only, detail on hover. */
  variant?: "default" | "compact";
};

const compactTokens = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

const exactTokens = new Intl.NumberFormat();

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
 * Spelled-out occupancy, for the tooltip and for the compact form's accessible
 * name: the exact counts a hover is expected to reveal, and the same truth a
 * screen reader gets from the bar without hovering anything.
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
 * Context-window occupancy: a quiet bar plus Pi's own `45%/200K` notation. An
 * unknown token count — before the first response, or between a compaction and
 * the next one — reads `?`, never a fabricated zero. The `compact` variant is
 * the production placement in the Session toolbar, where the row is only as
 * tall as an icon button: it keeps the share and the alarm colour, and hands
 * the counts to a tooltip.
 */
export function ContextUsageMeter({
  usage,
  isCompacting = false,
  variant = "default",
}: ContextUsageMeterProps) {
  const percent = usage?.percent ?? null;
  const level = usageLevel(percent, isCompacting);
  const share = percent === null ? "?" : `${Math.round(percent)}%`;
  const contextWindow = usage
    ? `/${compactTokens.format(usage.contextWindow)}`
    : "";
  const detail = usageDetail(usage, isCompacting);

  if (variant === "compact") {
    return (
      <Tooltip content={detail}>
        <div
          className="flex items-center gap-1.5"
          data-level={level}
          data-slot="context-usage-meter"
          data-variant="compact"
        >
          <span className="w-10">
            <ProgressBar
              isLabelHidden
              isIndeterminate={isCompacting}
              label={detail}
              value={percent ?? 0}
              variant={levelVariants[level]}
            />
          </span>
          {/* Fixed width: a share ticking 9% → 10% must not nudge the toolbar. */}
          <span className="flex w-8 justify-end">
            <Text as="span" color="secondary" hasTabularNumbers type="supporting">
              {isCompacting ? "…" : share}
            </Text>
          </span>
        </div>
      </Tooltip>
    );
  }

  return (
    <div
      className="flex items-center gap-2"
      data-level={level}
      data-slot="context-usage-meter"
      data-variant="default"
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
