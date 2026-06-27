import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "./sessions";
import {
  CostTrendChart,
  CostTrendSection,
  TokenHeatmap,
  UsageSecondLayer,
  UsageSummaryPanel,
} from "./usage";

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "usage-fixture",
    timestamp: "2026-01-01T10:00:00.000Z",
    project: "alpha",
    title: { kind: "raw", text: "usage-fixture" },
    totalCostUsd: 1,
    totalTokens: 1000,
    primaryModel: "gpt-5-codex",
    modelBreakdown: [],
    toolCounts: [],
    skillCounts: [],
    ...overrides,
  };
}

describe("UsageSecondLayer", () => {
  it("renders model, tool, and skill usage sections from session summaries", () => {
    const { container } = render(
      <UsageSecondLayer
        sessions={[
          session({
            modelBreakdown: [
              { model: "gpt-5-codex", costUsd: 0.8, tokens: 800 },
              { model: "gpt-5-mini", costUsd: 0.2, tokens: 200 },
            ],
            toolCounts: [
              { name: "read_file", count: 5 },
              { name: "run_command", count: 4 },
              { name: "long_tail_tool", count: 1 },
            ],
            skillCounts: [{ name: "review", count: 3 }],
          }),
        ]}
        rankLimit={2}
      />,
    );

    expect(screen.getByRole("heading", { name: "Cost by model" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Model distribution" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tool calls" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Skill usage" })).toBeInTheDocument();
    expect(screen.getAllByText("gpt-5-codex").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gpt-5-mini").length).toBeGreaterThan(0);
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("run_command")).toBeInTheDocument();
    expect(screen.queryByText("long_tail_tool")).not.toBeInTheDocument();
    expect(screen.getByText("review")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="segment"]')).toBeInTheDocument();
  });

  it("renders an empty skill state for sparse skill usage", () => {
    render(<UsageSecondLayer sessions={[session()]} />);

    expect(screen.getByText("No skill usage yet.")).toBeInTheDocument();
  });
});

describe("CostTrendChart", () => {
  it("renders monthly cost trends without horizontal scrolling by default", () => {
    const { container } = render(
      <CostTrendChart
        days={[
          {
            date: "2026-03-20",
            totalCostUsd: 1,
            projects: [{ project: "alpha", costUsd: 1 }],
          },
          {
            date: "2026-03-21",
            totalCostUsd: 0,
            projects: [],
          },
          {
            date: "2026-04-01",
            totalCostUsd: 2,
            projects: [{ project: "alpha", costUsd: 2 }],
          },
        ]}
        granularity="month"
        projects={["alpha"]}
      />,
    );

    const card = container.querySelector('[data-slot="card"]');
    const viewport = screen.getByTestId("cost-trend-chart-viewport");
    const chart = container.querySelector<HTMLElement>('[data-slot="bar-chart"]');

    expect(card).not.toHaveClass("overflow-x-auto");
    expect(viewport).toHaveAttribute("data-granularity", "month");
    expect(viewport).toHaveAttribute("data-scrollable", "false");
    expect(chart).toHaveAttribute("aria-label", "Monthly cost by project chart");
    expect(viewport).toContainElement(chart);
    expect(container.innerHTML).not.toContain("--pig-color-");
  });

  it("uses HeroUI Pro chart tokens instead of Pig color variables", () => {
    const source = readFileSync(join(process.cwd(), "src/usage.tsx"), "utf8");

    expect(source).toContain("const chartColorCount = 5;");
    expect(source).toContain("var(--chart-${(index % chartColorCount) + 1})");
    expect(source).toContain("var(--surface-tertiary)");
    expect(source).not.toContain("--pig-color-");
  });
});

describe("CostTrendSection", () => {
  it("offers useful time grains and defaults to month", () => {
    render(
      <CostTrendSection
        days={[
          {
            date: "2026-03-20",
            totalCostUsd: 1,
            projects: [{ project: "alpha", costUsd: 1 }],
          },
        ]}
        projects={["alpha"]}
      />,
    );

    expect(screen.getByText("Day")).toBeInTheDocument();
    expect(screen.getByText("Week")).toBeInTheDocument();
    expect(screen.getByText("Month")).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
    expect(screen.getByText("Cumulative")).toBeInTheDocument();
    expect(screen.getByTestId("cost-trend-chart-viewport")).toHaveAttribute(
      "data-granularity",
      "month",
    );
  });
});

describe("TokenHeatmap", () => {
  it("renders the latest full year as daily cells", () => {
    const { container } = render(
      <TokenHeatmap
        days={[
          { date: "2026-03-20", totalTokens: 100 },
          { date: "2026-06-24", totalTokens: 250 },
        ]}
      />,
    );

    const grid = screen.getByTestId("token-heatmap-grid");
    const calendar = screen.getByTestId("token-heatmap-calendar");
    const firstCell = container.querySelector("[data-token-day]");

    expect(screen.getByRole("heading", { name: "Token activity" })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="tabs"]')).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Daily" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Weekly" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cumulative" })).toBeInTheDocument();
    expect(calendar).toHaveClass("min-w-[48rem]", "lg:min-w-0");
    expect(grid).toHaveAttribute("data-year", "2026");
    expect(grid).toHaveAttribute("data-mode", "daily");
    expect(grid).toHaveAttribute("data-day-count", "365");
    expect(grid).toHaveStyle({
      gridTemplateColumns: "repeat(53, minmax(0, 1fr))",
    });
    expect(container.querySelectorAll("[data-token-day]")).toHaveLength(365);
    expect(firstCell).toHaveClass("aspect-square", "rounded-full");
    expect(firstCell).not.toHaveClass("rounded-[4px]");
    expect(firstCell).toHaveStyle({ backgroundColor: "var(--surface-secondary)" });
    expect(firstCell).toHaveAttribute("data-tokens", "0");
    expect(firstCell).toHaveAttribute("data-activity-value", "0");
    expect(firstCell).toHaveAttribute("data-date", "2025-07-01");
    expect(container.querySelector('[data-date="2026-03-20"]')).toHaveAttribute(
      "data-tokens",
      "100",
    );
    expect(container.querySelector('[data-date="2026-03-20"]')).toHaveStyle({
      backgroundColor: "var(--chart-2)",
    });
    expect(container.innerHTML).not.toContain("--pig-color-");
    expect(container.querySelector('[data-date="2026-06-30"]')).toHaveAttribute(
      "data-tokens",
      "0",
    );
    expect(container.querySelectorAll("[data-month-label]")).toHaveLength(12);
    expect(container.querySelector('[data-month-label="Jul"]')).toHaveStyle({
      gridColumnStart: "1",
    });
    expect(container.querySelector('[data-month-label="Jun"]')).toBeInTheDocument();
    expect(container.querySelector("[data-weekday-label]")).not.toBeInTheDocument();
    expect(screen.queryByText("Less")).not.toBeInTheDocument();
  });

  it("switches token activity aggregation modes", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TokenHeatmap
        days={[
          { date: "2026-01-01", totalTokens: 100 },
          { date: "2026-01-02", totalTokens: 300 },
        ]}
      />,
    );

    const janOne = () => container.querySelector('[data-date="2026-01-01"]');
    const janThree = () => container.querySelector('[data-date="2026-01-03"]');
    const grid = () => screen.getByTestId("token-heatmap-grid");

    expect(grid()).toHaveAttribute("data-mode", "daily");
    expect(janOne()).toHaveAttribute("data-activity-value", "100");
    expect(janThree()).toHaveAttribute("data-activity-value", "0");

    await user.click(screen.getByRole("tab", { name: "Weekly" }));

    expect(grid()).toHaveAttribute("data-mode", "weekly");
    expect(janOne()).toHaveAttribute("data-activity-value", "400");
    expect(janThree()).toHaveAttribute("data-activity-value", "400");

    await user.click(screen.getByRole("tab", { name: "Cumulative" }));

    expect(grid()).toHaveAttribute("data-mode", "cumulative");
    expect(janOne()).toHaveAttribute("data-activity-value", "100");
    expect(janThree()).toHaveAttribute("data-activity-value", "400");
  });
});

describe("UsageSummaryPanel", () => {
  it("keeps summary KPI cards visually aligned without repeated pricing copy", () => {
    const { container } = render(
      <UsageSummaryPanel sessions={[session()]} isFetching={false} onRefresh={() => {}} />,
    );

    expect(container.querySelector('[data-slot="kpi-footer"]')).not.toBeInTheDocument();
    expect(screen.queryByText("API list price")).not.toBeInTheDocument();
  });

  it("wraps the icon-only refresh action with a HeroUI tooltip trigger", () => {
    render(<UsageSummaryPanel sessions={[session()]} isFetching={false} onRefresh={() => {}} />);

    const refreshButton = screen.getByRole("button", { name: "Refresh usage" });
    const tooltipTrigger = screen.getByTestId("usage-refresh-tooltip-trigger");

    expect(tooltipTrigger).toHaveAttribute("data-slot", "tooltip-trigger");
    expect(tooltipTrigger).toContainElement(refreshButton);
  });
});
