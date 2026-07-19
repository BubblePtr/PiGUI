import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageTrendChart } from "@/pages/usage";

const tooltipFixture = vi.hoisted(() => ({
  payload: [] as Array<{
    dataKey: string;
    name: string;
    value: number;
    payload: { tooltipLabel: string };
  }>,
}));

vi.mock("@heroui-pro/react/bar-chart", async () => {
  const { cloneElement } = await import("react");

  const TooltipContent = ({
    active,
    label,
    payload,
  }: {
    active?: boolean;
    label?: ReactNode;
    payload?: Array<{ dataKey?: string; name?: string; value?: number }>;
  }) => {
    if (!active || !payload?.length) {
      return null;
    }

    return (
      <div data-testid="mock-chart-tooltip">
        <span>{label}</span>
        {payload.map((entry) => (
          <span key={entry.dataKey}>{`${entry.name}: ${entry.value}`}</span>
        ))}
      </div>
    );
  };

  const BarChart = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Bar: () => null,
      Grid: () => null,
      Tooltip: ({ content }: { content: ReactElement<Record<string, unknown>> }) =>
        cloneElement(content, {
          active: true,
          label: "Jun 26",
          payload: tooltipFixture.payload,
        }),
      TooltipContent,
      XAxis: () => null,
      YAxis: () => null,
    },
  );

  return { BarChart };
});

describe("UsageTrendChart tooltip", () => {
  beforeEach(() => {
    tooltipFixture.payload = [];
  });

  it("does not render a project list when every value is zero", () => {
    tooltipFixture.payload = [
      {
        dataKey: "project_0",
        name: "alpha",
        value: 0,
        payload: { tooltipLabel: "Jun 26" },
      },
      {
        dataKey: "project_1",
        name: "beta",
        value: 0,
        payload: { tooltipLabel: "Jun 26" },
      },
    ];

    render(
      <UsageTrendChart
        days={[{ date: "2026-06-26", totalTokens: 0, projects: [] }]}
        preset="30d"
        projects={["alpha", "beta"]}
      />,
    );

    expect(screen.queryByTestId("mock-chart-tooltip")).not.toBeInTheDocument();
  });

  it("keeps only non-zero projects for an active bucket", () => {
    tooltipFixture.payload = [
      {
        dataKey: "project_0",
        name: "alpha",
        value: 120,
        payload: { tooltipLabel: "Jun 26" },
      },
      {
        dataKey: "project_1",
        name: "beta",
        value: 0,
        payload: { tooltipLabel: "Jun 26" },
      },
    ];

    render(
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

    expect(screen.getByText("alpha: 120")).toBeInTheDocument();
    expect(screen.queryByText("beta: 0")).not.toBeInTheDocument();
  });
});
