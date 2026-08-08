import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsageTrendChart } from "@/pages/usage";

describe("UsageTrendChart tooltip", () => {
  it("does not render a tooltip for zero-total buckets", () => {
    const { container } = render(
      <UsageTrendChart
        days={[{ date: "2026-06-26", totalTokens: 0, projects: [] }]}
        preset="30d"
        projects={["alpha", "beta"]}
      />,
    );

    expect(container.querySelector('[data-slot="bar-chart-tooltip"]')).toBeNull();
  });

  it("keeps only non-zero projects for an active bucket", () => {
    const { container } = render(
      <UsageTrendChart
        days={[
          {
            date: "2026-06-26",
            totalTokens: 120,
            projects: [{ project: "alpha", tokens: 120 }],
          },
        ]}
        preset="30d"
        projects={["alpha", "beta"]}
      />,
    );

    const tooltip = container.querySelector(
      '[data-bucket-key="2026-06-26"] [data-slot="bar-chart-tooltip"]',
    );

    expect(tooltip).not.toBeNull();
    expect(tooltip).toHaveTextContent("Jun 26");
    expect(tooltip).toHaveTextContent("alpha");
    expect(tooltip).toHaveTextContent("120 tokens");
    expect(tooltip).not.toHaveTextContent("beta");
    // Only one bucket has activity, so only one tooltip exists at all.
    expect(
      container.querySelectorAll('[data-slot="bar-chart-tooltip"]'),
    ).toHaveLength(1);
  });
});
