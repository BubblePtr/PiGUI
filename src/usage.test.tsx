import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "./sessions";
import { UsageSecondLayer } from "./usage";

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
    render(
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
  });

  it("renders an empty skill state for sparse skill usage", () => {
    render(<UsageSecondLayer sessions={[session()]} />);

    expect(screen.getByText("No skill usage yet.")).toBeInTheDocument();
  });
});
