import { Card } from "@astryxdesign/core/Card";
import { Text } from "@astryxdesign/core/Text";
import type { ReactNode } from "react";

export type PiKpiProps = {
  /** Stat label, e.g. "Total cost". */
  label: string;
  /** Numeric stat value, formatted with Intl.NumberFormat. */
  value?: number;
  /** Intl.NumberFormat options for `value` (currency, compact notation, ...). */
  formatOptions?: Intl.NumberFormatOptions;
  /** Optional trend/delta annotation rendered after the value. */
  delta?: ReactNode;
  /** stacked = label above value (dashboard tile); inline = label and value on one row. */
  layout?: "stacked" | "inline";
  /** Custom value node; replaces the formatted `value`. */
  children?: ReactNode;
  valueClassName?: string;
  valueTestId?: string;
};

/**
 * Stat tile (label + value + optional delta) on Astryx Card/Text tokens.
 */
export function PiKpi({
  label,
  value,
  formatOptions,
  delta,
  layout = "stacked",
  children,
  valueClassName = "",
  valueTestId,
}: PiKpiProps) {
  const formattedValue =
    typeof value === "number"
      ? new Intl.NumberFormat(undefined, formatOptions).format(value)
      : null;

  return (
    <Card padding={4}>
      <dl className={`pi-kpi pi-kpi--${layout}`} data-slot="kpi">
        <Text as="span" color="secondary" type="supporting">
          <dt className="pi-kpi__label">{label}</dt>
        </Text>
        <dd className="pi-kpi__value-row">
          <span
            className={`pi-kpi__value ${valueClassName}`.trim()}
            data-slot="kpi-value"
            {...(valueTestId ? { "data-testid": valueTestId } : {})}
          >
            {children ?? formattedValue}
          </span>
          {delta !== undefined && delta !== null ? (
            <span className="pi-kpi__delta" data-slot="kpi-delta">
              {delta}
            </span>
          ) : null}
        </dd>
      </dl>
    </Card>
  );
}
