export type PiBarChartSeries = {
  /** Key into each datum's `values` record. */
  key: string;
  /** Human-readable series name shown in tooltips. */
  label: string;
  /** CSS color (token var) for this series' segments. */
  color: string;
};

export type PiBarChartDatum = {
  key: string;
  /** Axis tick label. */
  label: string;
  /** Tooltip heading; falls back to `label`. */
  tooltipLabel?: string;
  values: Record<string, number>;
};

/**
 * Hand-rolled stacked bar chart on Astryx tokens for the Usage trend —
 * deliberately not a charting library. Layout divs are intentional and
 * contained to this component. Tooltips are rendered per bucket and revealed
 * on hover/focus via primitives.css.
 */
export function PiBarChart({
  "aria-label": ariaLabel,
  data,
  series,
  height = 200,
  barSize = 14,
  tickInterval = 0,
  valueFormatter = (value: number) => String(value),
  emptyLabel = "No data yet",
  className = "",
}: {
  "aria-label": string;
  data: PiBarChartDatum[];
  series: PiBarChartSeries[];
  /** Plot area height in pixels. */
  height?: number;
  /** Bar width in pixels. */
  barSize?: number;
  /** Recharts-style interval: n ticks are skipped between rendered labels. */
  tickInterval?: number;
  valueFormatter?: (value: number) => string;
  /** Shown inside the plot when `data` is empty. */
  emptyLabel?: string;
  className?: string;
}) {
  const bucketTotals = data.map((datum) =>
    series.reduce((total, item) => total + (datum.values[item.key] ?? 0), 0),
  );
  const maxTotal = Math.max(...bucketTotals, 0);

  return (
    <div
      aria-label={ariaLabel}
      className={`pi-bar-chart ${className}`.trim()}
      data-slot="bar-chart"
      role="img"
    >
      <div className="pi-bar-chart__plot" style={{ height }}>
        {data.length === 0 ? (
          <span className="pi-bar-chart__empty" data-slot="bar-chart-empty">
            {emptyLabel}
          </span>
        ) : null}
        {data.map((datum, index) => {
          const total = bucketTotals[index];
          const nonZeroSeries = series.filter(
            (item) => (datum.values[item.key] ?? 0) > 0,
          );

          return (
            <div
              className="pi-bar-chart__bucket"
              data-bucket-key={datum.key}
              key={datum.key}
              tabIndex={total > 0 ? 0 : undefined}
            >
              <div className="pi-bar-chart__stack" style={{ width: barSize }}>
                {nonZeroSeries.map((item) => {
                  const value = datum.values[item.key] ?? 0;
                  const share = maxTotal === 0 ? 0 : (value / maxTotal) * 100;

                  return (
                    <span
                      className="pi-bar-chart__segment"
                      data-series-key={item.key}
                      key={item.key}
                      style={{
                        backgroundColor: item.color,
                        height: `${share}%`,
                      }}
                    />
                  );
                })}
              </div>
              {total > 0 ? (
                <div
                  className="pi-bar-chart__tooltip"
                  data-slot="bar-chart-tooltip"
                  role="presentation"
                >
                  <span className="pi-bar-chart__tooltip-label">
                    {datum.tooltipLabel ?? datum.label}
                  </span>
                  {nonZeroSeries.map((item) => (
                    <span className="pi-bar-chart__tooltip-row" key={item.key}>
                      <span
                        aria-hidden="true"
                        className="pi-bar-chart__tooltip-swatch"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="pi-bar-chart__tooltip-name">
                        {item.label}
                      </span>
                      <span className="pi-bar-chart__tooltip-value">
                        {valueFormatter(datum.values[item.key] ?? 0)}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="pi-bar-chart__axis">
        {data.map((datum, index) => (
          <span className="pi-bar-chart__tick-slot" key={datum.key}>
            {index % (tickInterval + 1) === 0 ? (
              <span className="pi-bar-chart__tick" data-tick>
                {datum.label}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
