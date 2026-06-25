import { describe, expect, it } from "vitest";
import {
  aggregateCostByModel,
  aggregateDailyCostByProject,
  aggregateDailyTokens,
  buildAnnualTokenHeatmap,
  buildTrailingAnnualTokenHeatmap,
  bucketCostByProject,
  aggregateModelDistribution,
  aggregateSkillCounts,
  aggregateToolCounts,
} from "./usage-aggregation";
import type { SessionSummary } from "./sessions";

function session(
  id: string,
  timestamp: string,
  project: string,
  totalCostUsd: number,
  totalTokens: number,
  options: Partial<Pick<SessionSummary, "modelBreakdown" | "toolCounts" | "skillCounts">> = {},
): SessionSummary {
  return {
    id,
    timestamp,
    project,
    totalCostUsd,
    totalTokens,
    title: { kind: "raw", text: id },
    modelBreakdown: options.modelBreakdown ?? [],
    toolCounts: options.toolCounts ?? [],
    skillCounts: options.skillCounts ?? [],
  };
}

describe("aggregateDailyCostByProject", () => {
  it("returns an empty range for no sessions", () => {
    expect(aggregateDailyCostByProject([])).toEqual([]);
  });

  it("groups cost by UTC day and project, filling sparse days", () => {
    const sessions = [
      session("a", "2026-01-01T23:00:00.000Z", "alpha", 0.25, 100),
      session("b", "2026-01-03T01:00:00.000Z", "beta", 0.5, 200),
      session("c", "2026-01-03T12:00:00.000Z", "alpha", 0.75, 300),
    ];

    expect(aggregateDailyCostByProject(sessions)).toEqual([
      {
        date: "2026-01-01",
        totalCostUsd: 0.25,
        projects: [{ project: "alpha", costUsd: 0.25 }],
      },
      {
        date: "2026-01-02",
        totalCostUsd: 0,
        projects: [],
      },
      {
        date: "2026-01-03",
        totalCostUsd: 1.25,
        projects: [
          { project: "alpha", costUsd: 0.75 },
          { project: "beta", costUsd: 0.5 },
        ],
      },
    ]);
  });
});

describe("aggregateDailyTokens", () => {
  it("returns an empty range for no sessions", () => {
    expect(aggregateDailyTokens([])).toEqual([]);
  });

  it("groups tokens by UTC day, filling sparse days", () => {
    const sessions = [
      session("a", "2026-01-01T23:00:00.000Z", "alpha", 0.25, 100),
      session("b", "2026-01-03T01:00:00.000Z", "beta", 0.5, 200),
      session("c", "2026-01-03T12:00:00.000Z", "alpha", 0.75, 300),
    ];

    expect(aggregateDailyTokens(sessions)).toEqual([
      { date: "2026-01-01", totalTokens: 100 },
      { date: "2026-01-02", totalTokens: 0 },
      { date: "2026-01-03", totalTokens: 500 },
    ]);
  });
});

describe("buildAnnualTokenHeatmap", () => {
  it("expands sparse token days to a full calendar year", () => {
    const heatmap = buildAnnualTokenHeatmap([
      { date: "2026-03-20", totalTokens: 100 },
      { date: "2026-06-24", totalTokens: 250 },
    ]);

    expect(heatmap).toMatchObject({
      year: 2026,
      weekCount: 53,
    });
    expect(heatmap?.days).toHaveLength(365);
    expect(heatmap?.days[0]).toMatchObject({
      date: "2026-01-01",
      totalTokens: 0,
      weekdayIndex: 4,
      weekIndex: 0,
    });
    expect(heatmap?.days.find((day) => day.date === "2026-03-20")).toMatchObject({
      totalTokens: 100,
    });
    expect(heatmap?.days[heatmap.days.length - 1]).toMatchObject({
      date: "2026-12-31",
      totalTokens: 0,
    });
    expect(heatmap?.monthLabels.map((month) => month.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
  });

  it("uses the latest data year when more than one year is present", () => {
    const heatmap = buildAnnualTokenHeatmap([
      { date: "2025-12-31", totalTokens: 100 },
      { date: "2026-01-02", totalTokens: 200 },
    ]);

    expect(heatmap?.year).toBe(2026);
    expect(heatmap?.days.find((day) => day.date === "2026-01-02")).toMatchObject({
      totalTokens: 200,
    });
    expect(heatmap?.days.some((day) => day.date === "2025-12-31")).toBe(false);
  });
});

describe("buildTrailingAnnualTokenHeatmap", () => {
  it("expands sparse token days to the latest twelve calendar months", () => {
    const heatmap = buildTrailingAnnualTokenHeatmap([
      { date: "2026-03-20", totalTokens: 100 },
      { date: "2026-06-24", totalTokens: 250 },
    ]);

    expect(heatmap).toMatchObject({
      year: 2026,
      startDate: "2025-07-01",
      endDate: "2026-06-30",
    });
    expect(heatmap?.days[0]).toMatchObject({
      date: "2025-07-01",
      totalTokens: 0,
    });
    expect(heatmap?.days.find((day) => day.date === "2026-03-20")).toMatchObject({
      totalTokens: 100,
    });
    expect(heatmap?.days[heatmap.days.length - 1]).toMatchObject({
      date: "2026-06-30",
      totalTokens: 0,
    });
    expect(heatmap?.monthLabels.map((month) => month.label)).toEqual([
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
    ]);
  });
});

describe("bucketCostByProject", () => {
  const days = [
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
      date: "2026-03-22",
      totalCostUsd: 2,
      projects: [{ project: "beta", costUsd: 2 }],
    },
    {
      date: "2026-04-01",
      totalCostUsd: 3,
      projects: [{ project: "alpha", costUsd: 3 }],
    },
  ];

  it("groups daily project costs by month without keeping daily ticks", () => {
    expect(bucketCostByProject(days, "month")).toEqual([
      {
        key: "2026-03",
        startDate: "2026-03-20",
        endDate: "2026-03-22",
        totalCostUsd: 3,
        projects: [
          { project: "beta", costUsd: 2 },
          { project: "alpha", costUsd: 1 },
        ],
      },
      {
        key: "2026-04",
        startDate: "2026-04-01",
        endDate: "2026-04-01",
        totalCostUsd: 3,
        projects: [{ project: "alpha", costUsd: 3 }],
      },
    ]);
  });

  it("groups daily project costs by UTC week and cumulative total", () => {
    expect(bucketCostByProject(days, "week").map((bucket) => bucket.key)).toEqual([
      "2026-03-16",
      "2026-03-30",
    ]);
    expect(bucketCostByProject(days, "cumulative")).toEqual([
      {
        key: "cumulative",
        startDate: "2026-03-20",
        endDate: "2026-04-01",
        totalCostUsd: 6,
        projects: [
          { project: "alpha", costUsd: 4 },
          { project: "beta", costUsd: 2 },
        ],
      },
    ]);
  });
});

describe("aggregateCostByModel", () => {
  it("groups model cost and tokens across sessions", () => {
    const sessions = [
      session("a", "2026-01-01T23:00:00.000Z", "alpha", 0.25, 100, {
        modelBreakdown: [
          { model: "gpt-5-codex", costUsd: 0.2, tokens: 80 },
          { model: "gpt-5-mini", costUsd: 0.05, tokens: 20 },
        ],
      }),
      session("b", "2026-01-03T01:00:00.000Z", "beta", 0.5, 200, {
        modelBreakdown: [{ model: "gpt-5-mini", costUsd: 0.5, tokens: 200 }],
      }),
    ];

    expect(aggregateCostByModel(sessions)).toEqual([
      { model: "gpt-5-mini", costUsd: 0.55, tokens: 220 },
      { model: "gpt-5-codex", costUsd: 0.2, tokens: 80 },
    ]);
  });
});

describe("aggregateModelDistribution", () => {
  it("returns cost and token shares for each model", () => {
    const sessions = [
      session("a", "2026-01-01T23:00:00.000Z", "alpha", 0.25, 100, {
        modelBreakdown: [
          { model: "gpt-5-codex", costUsd: 0.2, tokens: 80 },
          { model: "gpt-5-mini", costUsd: 0.05, tokens: 20 },
        ],
      }),
      session("b", "2026-01-03T01:00:00.000Z", "beta", 0.75, 300, {
        modelBreakdown: [{ model: "gpt-5-mini", costUsd: 0.75, tokens: 300 }],
      }),
    ];

    expect(aggregateModelDistribution(sessions)).toEqual([
      {
        model: "gpt-5-mini",
        costUsd: 0.8,
        tokens: 320,
        costShare: 0.8,
        tokenShare: 0.8,
      },
      {
        model: "gpt-5-codex",
        costUsd: 0.2,
        tokens: 80,
        costShare: 0.2,
        tokenShare: 0.2,
      },
    ]);
  });
});

describe("aggregateToolCounts", () => {
  it("groups tool counts across sessions and returns the top results", () => {
    const sessions = [
      session("a", "2026-01-01T23:00:00.000Z", "alpha", 0.25, 100, {
        toolCounts: [
          { name: "read_file", count: 2 },
          { name: "list_files", count: 1 },
        ],
      }),
      session("b", "2026-01-03T01:00:00.000Z", "beta", 0.75, 300, {
        toolCounts: [
          { name: "read_file", count: 3 },
          { name: "run_command", count: 4 },
        ],
      }),
    ];

    expect(aggregateToolCounts(sessions, 2)).toEqual([
      { name: "read_file", count: 5 },
      { name: "run_command", count: 4 },
    ]);
  });
});

describe("aggregateSkillCounts", () => {
  it("groups skill counts across sessions and returns the top results", () => {
    const sessions = [
      session("a", "2026-01-01T23:00:00.000Z", "alpha", 0.25, 100, {
        skillCounts: [
          { name: "kami", count: 2 },
          { name: "review", count: 1 },
        ],
      }),
      session("b", "2026-01-03T01:00:00.000Z", "beta", 0.75, 300, {
        skillCounts: [
          { name: "review", count: 4 },
          { name: "summarize", count: 1 },
        ],
      }),
    ];

    expect(aggregateSkillCounts(sessions, 2)).toEqual([
      { name: "review", count: 5 },
      { name: "kami", count: 2 },
    ]);
  });

  it("returns an empty list when sessions have no skill usage", () => {
    expect(
      aggregateSkillCounts([
        session("a", "2026-01-01T23:00:00.000Z", "alpha", 0.25, 100),
      ]),
    ).toEqual([]);
  });
});
