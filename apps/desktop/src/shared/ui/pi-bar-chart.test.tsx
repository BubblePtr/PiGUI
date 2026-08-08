import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PiBarChart } from "@/shared/ui/pi-bar-chart";

const series = [
  { key: "project_0", label: "alpha", color: "var(--pigui-data-blue)" },
  { key: "project_1", label: "beta", color: "var(--pigui-data-orange)" },
];

const data = [
  {
    key: "2026-06-25",
    label: "Jun 25",
    tooltipLabel: "Jun 25",
    values: { project_0: 100, project_1: 0 },
  },
  {
    key: "2026-06-26",
    label: "Jun 26",
    tooltipLabel: "Jun 26",
    values: { project_0: 120, project_1: 80 },
  },
  {
    key: "2026-06-27",
    label: "Jun 27",
    tooltipLabel: "Jun 27",
    values: { project_0: 0, project_1: 0 },
  },
];

describe("PiBarChart", () => {
  it("renders a labeled chart image with one stacked bar per bucket", () => {
    const { container } = render(
      <PiBarChart
        aria-label="Token usage trend by project chart"
        barSize={14}
        data={data}
        height={200}
        series={series}
      />,
    );

    const chart = screen.getByRole("img", {
      name: "Token usage trend by project chart",
    });

    expect(chart).toHaveAttribute("data-slot", "bar-chart");
    expect(container.querySelectorAll("[data-bucket-key]")).toHaveLength(3);

    const segments = container.querySelectorAll(
      '[data-bucket-key="2026-06-26"] [data-series-key]',
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveStyle({
      backgroundColor: "var(--pigui-data-blue)",
    });
  });

  it("sizes stacked segments relative to the tallest bucket", () => {
    const { container } = render(
      <PiBarChart aria-label="chart" data={data} series={series} />,
    );

    // Tallest bucket totals 200 tokens; alpha on Jun 25 is 100 → 50%.
    const segment = container.querySelector(
      '[data-bucket-key="2026-06-25"] [data-series-key="project_0"]',
    );

    expect(segment).toHaveStyle({ height: "50%" });
  });

  it("skips intermediate axis labels per tick interval", () => {
    const { container } = render(
      <PiBarChart
        aria-label="chart"
        data={data}
        series={series}
        tickInterval={1}
      />,
    );

    const ticks = Array.from(
      container.querySelectorAll("[data-tick]"),
      (tick) => tick.textContent,
    );

    expect(ticks).toEqual(["Jun 25", "Jun 27"]);
  });

  it("lists only non-zero series in a bucket tooltip", () => {
    const { container } = render(
      <PiBarChart
        aria-label="chart"
        data={data}
        series={series}
        valueFormatter={(value) => `${value} tokens`}
      />,
    );

    const tooltip = container.querySelector(
      '[data-bucket-key="2026-06-25"] [data-slot="bar-chart-tooltip"]',
    );

    expect(tooltip).toHaveTextContent("Jun 25");
    expect(tooltip).toHaveTextContent("alpha");
    expect(tooltip).toHaveTextContent("100 tokens");
    expect(tooltip).not.toHaveTextContent("beta");
  });

  it("renders no tooltip for zero-total buckets", () => {
    const { container } = render(
      <PiBarChart aria-label="chart" data={data} series={series} />,
    );

    expect(
      container.querySelector(
        '[data-bucket-key="2026-06-27"] [data-slot="bar-chart-tooltip"]',
      ),
    ).toBeNull();
  });
});
