import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "@/entities/session/sessions";
import {
  ModelMixCard,
  TokenHeatmap,
  UsageTrendChart,
  UsageTrendSection,
  UsageSecondLayer,
  UsageSummaryPanel,
} from "@/pages/usage";

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

    expect(screen.getByRole("heading", { name: "Tool calls" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Skill usage" })).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("run_command")).toBeInTheDocument();
    expect(screen.queryByText("long_tail_tool")).not.toBeInTheDocument();
    expect(screen.getByText("review")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(2);
    expect(screen.getAllByTestId("rank-card-content")).toHaveLength(2);
    expect(
      screen.getAllByTestId("rank-card-content").every((content) => content.classList.contains("p-5")),
    ).toBe(true);
  });

  it("renders an empty skill state for sparse skill usage", () => {
    render(<UsageSecondLayer sessions={[session()]} />);

    expect(screen.getByText("No skill usage yet.")).toBeInTheDocument();
  });
});

describe("UsageTrendChart", () => {
  it("renders a stable set of project token buckets with a fixed bar width", () => {
    const { container } = render(
      <UsageTrendChart
        days={[
          {
            date: "2026-03-20",
            totalTokens: 100,
            projects: [{ project: "alpha", tokens: 100 }],
          },
          {
            date: "2026-03-21",
            totalTokens: 0,
            projects: [],
          },
          {
            date: "2026-03-22",
            totalTokens: 200,
            projects: [{ project: "alpha", tokens: 200 }],
          },
        ]}
        projects={["alpha"]}
        preset="30d"
      />,
    );

    const viewport = screen.getByTestId("usage-trend-chart-viewport");
    const chart = container.querySelector<HTMLElement>('[data-slot="bar-chart"]');

    expect(viewport).toHaveAttribute("data-preset", "30d");
    expect(viewport).toHaveAttribute("data-bucket-count", "30");
    expect(viewport).toHaveAttribute("data-bar-size", "14");
    expect(chart).toHaveAttribute("aria-label", "Token usage trend by project chart");
    expect(viewport).toContainElement(chart);
  });
});

describe("UsageTrendSection", () => {
  it("offers stable trend presets and defaults to 30 daily buckets", async () => {
    const user = userEvent.setup();

    render(
      <UsageTrendSection
        days={[
          {
            date: "2026-03-20",
            totalTokens: 100,
            projects: [{ project: "alpha", tokens: 100 }],
          },
        ]}
        projects={["alpha"]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Usage trend" })).toBeInTheDocument();
    expect(screen.getByText("30D")).toBeInTheDocument();
    expect(screen.getByText("12W")).toBeInTheDocument();
    expect(screen.getByText("12M")).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.getByTestId("usage-trend-chart-viewport")).toHaveAttribute(
      "data-preset",
      "30d",
    );
    expect(screen.getByTestId("usage-trend-card-content")).toHaveClass("p-5");

    await user.click(screen.getByText("12W"));

    expect(screen.getByTestId("usage-trend-chart-viewport")).toHaveAttribute(
      "data-preset",
      "12w",
    );
    expect(screen.getByTestId("usage-trend-chart-viewport")).toHaveAttribute(
      "data-bucket-count",
      "12",
    );
  });
});

describe("ModelMixCard", () => {
  it("renders a colorful token distribution with model cost context", () => {
    const { container } = render(
      <ModelMixCard
        sessions={[
          session({
            modelBreakdown: [
              { model: "gpt-5-codex", costUsd: 0.8, tokens: 800 },
              { model: "gpt-5-mini", costUsd: 0.2, tokens: 200 },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Model mix" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Model token distribution" })).toBeInTheDocument();
    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
    expect(screen.getByText("gpt-5-mini")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(container.innerHTML).toContain("--pigui-data-orange");
    expect(screen.getByTestId("model-mix-card-content")).toHaveClass("p-5");
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
    const monthHeader = grid.previousElementSibling;
    const layout = screen.getByTestId("token-heatmap-layout");
    const summary = screen.getByTestId("token-heatmap-summary");
    const legendDots = summary.querySelectorAll("[aria-hidden].size-3");

    expect(screen.getByRole("heading", { name: "Token activity" })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="tabs"]')).not.toBeInTheDocument();
    expect(screen.queryByText("Weekly")).not.toBeInTheDocument();
    expect(screen.queryByText("Cumulative")).not.toBeInTheDocument();
    expect(screen.getByTestId("token-heatmap-card-content")).toHaveClass("p-5");
    expect(layout).toHaveClass("xl:grid-cols-[max-content_minmax(7rem,1fr)]");
    expect(layout).toContainElement(calendar);
    expect(layout).toContainElement(summary);
    expect(summary).toHaveClass("xl:border-l", "xl:border-t-0");
    expect(calendar).toHaveClass("w-max");
    expect(calendar).not.toHaveClass("w-full");
    expect(grid).toHaveAttribute("data-year", "2026");
    expect(grid).not.toHaveAttribute("data-mode");
    expect(grid).toHaveAttribute("data-day-count", "365");
    expect(grid).toHaveStyle({
      gridTemplateColumns: "repeat(53, 0.75rem)",
    });
    expect(monthHeader).toHaveStyle({
      gridTemplateColumns: "repeat(53, 0.75rem)",
    });
    expect(grid).toHaveClass("gap-0.5");
    expect(monthHeader).toHaveClass("gap-0.5");
    expect(container.querySelectorAll("[data-token-day]")).toHaveLength(365);
    expect(firstCell).toHaveClass("size-3", "justify-self-center", "rounded-full");
    expect(firstCell).not.toHaveClass("border", "border-border");
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
      backgroundColor: "var(--pigui-data-coral)",
    });
    expect(container.innerHTML).not.toContain("--pigui-color-");
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
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();
    expect(legendDots).toHaveLength(5);
    expect(Array.from(legendDots).every((dot) => !dot.classList.contains("border"))).toBe(true);
    expect(screen.getByLabelText("2 active days")).toBeInTheDocument();
    expect(screen.getByLabelText("250 peak day")).toBeInTheDocument();
  });
});

describe("UsageSummaryPanel", () => {
  it("starts with KPI cards instead of repeating the current route", () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/pages/usage.tsx"), "utf8");

    expect(source).not.toContain(">Usage</div>");
    expect(source).not.toContain("Analyze / Usage");
    expect(source).not.toContain("Cost and token trends");
    expect(source).not.toContain("Cost is shown as API list price");
    expect(source).toContain("max-w-5xl");
    expect(source).not.toContain("max-w-6xl");
  });

  it("keeps summary KPI cards visually aligned without repeated pricing copy", () => {
    const { container } = render(
      <UsageSummaryPanel sessions={[session()]} isFetching={false} onRefresh={() => {}} />,
    );

    const summary = screen.getByTestId("usage-summary");

    expect(summary).not.toHaveAttribute("data-slot", "card");
    expect(summary.closest('[data-slot="card"]')).toBeNull();
    expect(container.querySelector('[data-slot="kpi-footer"]')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="kpi"]')).toHaveLength(4);
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.queryByText("Usage summary")).not.toBeInTheDocument();
    expect(screen.queryByText("All sessions")).not.toBeInTheDocument();
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
