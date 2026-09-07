import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SessionTurn } from "@pigui/core";
import type { TrajectoryRole, TrajectoryStep } from "@/entities/session/trajectory-model";
import { buildTrajectoryRuns, buildTrajectoryTurns } from "@/entities/session/trajectory-model";
import { PiTrajectoryLedger, trajectoryStepType } from "@/shared/ui/pi-trajectory-ledger";

const sessionTurns: SessionTurn[] = [
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:41:00.000Z",
    parts: [{ partType: "text", text: "Fix the failing formatter test.", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    timestamp: "2026-03-22T14:41:42.000Z",
    model: "gpt-5-codex",
    usage: {
      inputTokens: 40_000,
      outputTokens: 3_800,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 43_800,
    },
    cost: { inputUsd: 0.2, outputUsd: 0.13, cacheReadUsd: 0, cacheWriteUsd: 0, totalUsd: 0.3301 },
    parts: [
      { partType: "thinking", text: "Root cause confirmed, fixing.", payload: {} },
      {
        partType: "toolCall",
        name: "bash",
        payload: { id: "c1", arguments: { command: "git diff --stat" } },
      },
      {
        partType: "toolResult",
        name: "bash",
        text: "3 files changed",
        isError: false,
        durationMs: 340,
        payload: { toolCallId: "c1" },
      },
      {
        partType: "toolCall",
        name: "edit",
        payload: { id: "c2", arguments: { path: "src/utils/formatDate.ts" } },
      },
      {
        partType: "toolResult",
        name: "edit",
        text: "patch failed to apply",
        isError: true,
        durationMs: 12_400,
        payload: { toolCallId: "c2" },
      },
      {
        partType: "toolCall",
        name: "grep",
        payload: { id: "c3", arguments: { pattern: "remapToolCallId" } },
      },
      { partType: "text", text: "Done — three files updated.", payload: {} },
    ],
  },
];

function renderLedger() {
  const runs = buildTrajectoryRuns(buildTrajectoryTurns(sessionTurns));
  const onSelectedStepChange = vi.fn();
  const utils = render(<PiTrajectoryLedger runs={runs} onSelectedStepChange={onSelectedStepChange} />);
  return { runs, onSelectedStepChange, ...utils };
}

describe("PiTrajectoryLedger", () => {
  it("groups steps under sticky Run headers with run tokens", () => {
    const { container } = renderLedger();

    expect(container.querySelectorAll('[data-slot="trajectory-ledger-run"]')).toHaveLength(1);
    expect(screen.getByText("Run #1")).toBeInTheDocument();
    expect(screen.getByText("43.8K tok")).toBeInTheDocument();
  });

  it("marks a Turn boundary dot for each assistant message, none for user input", () => {
    const { container } = renderLedger();

    expect(container.querySelectorAll('[data-slot="trajectory-turn-boundary"]')).toHaveLength(1);
  });

  it("renders rows as badge + request → result with status and duration", () => {
    const { container } = renderLedger();

    const rows = container.querySelectorAll('[data-slot="trajectory-ledger-row"]');
    expect(rows).toHaveLength(6);

    const badges = [...container.querySelectorAll('[data-slot="trajectory-step-badge"]')].map(
      (badge) => badge.textContent,
    );
    expect(badges).toEqual(["user", "assistant", "tool", "tool", "tool", "assistant"]);

    expect(screen.getByText('{"command":"git diff --stat"}')).toBeInTheDocument();
    expect(screen.getByText("3 files changed")).toBeInTheDocument();
    expect(screen.getByText("patch failed to apply")).toBeInTheDocument();
    expect(screen.getByText("340ms")).toBeInTheDocument();
    expect(screen.getByText("12.4s")).toBeInTheDocument();
  });

  it("exposes kind and tool status as data attributes", () => {
    const { container } = renderLedger();

    const toolRows = container.querySelectorAll('[data-kind="tool"]');
    expect(toolRows[0]).toHaveAttribute("data-status", "ok");
    expect(toolRows[1]).toHaveAttribute("data-status", "error");
    expect(toolRows[2]).toHaveAttribute("data-status", "running");
  });

  it("never expands inline: clicking a row selects it for the Inspector", async () => {
    const user = userEvent.setup();
    const { onSelectedStepChange, container } = renderLedger();

    const row = screen.getByRole("button", { name: /git diff --stat/ });
    expect(row).not.toHaveAttribute("aria-expanded");

    await user.click(row);
    expect(onSelectedStepChange).toHaveBeenCalledWith("t1-s1");
    // Full output stays out of the ledger DOM regardless of selection.
    expect(container.textContent).not.toContain("aria-expanded");
  });

  it("marks the Playhead row via selectedStepId", () => {
    const runs = buildTrajectoryRuns(buildTrajectoryTurns(sessionTurns));
    const { container } = render(<PiTrajectoryLedger runs={runs} selectedStepId="t1-s1" />);

    const playhead = container.querySelector("[data-playhead]");
    expect(playhead).not.toBeNull();
    expect(playhead).toHaveAttribute("aria-pressed", "true");
  });

  it("dims individual rows outside the focused swimlane block", () => {
    const runs = buildTrajectoryRuns(buildTrajectoryTurns(sessionTurns));
    const { container } = render(
      <PiTrajectoryLedger
        runs={runs}
        isStepDimmed={(step) => step.kind !== "tool"}
      />,
    );

    const rows = [...container.querySelectorAll('[data-slot="trajectory-ledger-row"]')];
    const dimmed = rows.filter((row) => row.hasAttribute("data-focus-dimmed"));
    const lit = rows.filter((row) => !row.hasAttribute("data-focus-dimmed"));

    expect(dimmed.length).toBeGreaterThan(0);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.every((row) => row.getAttribute("data-kind") === "tool")).toBe(true);
  });

  it("drops steps failing stepFilter and dims runs outside the focus range", () => {
    const runs = buildTrajectoryRuns(buildTrajectoryTurns(sessionTurns));
    const { container } = render(
      <PiTrajectoryLedger
        isDimmed
        runs={runs}
        stepFilter={(step) => step.kind === "tool"}
      />,
    );

    expect(container.querySelectorAll('[data-slot="trajectory-ledger-row"]')).toHaveLength(3);
    expect(container.querySelector("[data-focus-dimmed]")).not.toBeNull();
  });

  it("exposes Run standalone so pages can virtualize by Active Run", () => {
    const runs = buildTrajectoryRuns(buildTrajectoryTurns(sessionTurns));
    const { container } = render(
      <PiTrajectoryLedger>
        <PiTrajectoryLedger.Run run={runs[0]} />
      </PiTrajectoryLedger>,
    );

    expect(container.querySelectorAll('[data-slot="trajectory-ledger-run"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="trajectory-ledger-row"]')).toHaveLength(6);
  });

  it("renders an empty state label when there are no runs", () => {
    render(<PiTrajectoryLedger emptyLabel="No timeline entries found." runs={[]} />);

    expect(screen.getByText("No timeline entries found.")).toBeInTheDocument();
  });

  // Badges encode a step's type, not its outcome: borrowing a semantic token
  // (CONTEXT once used `--success`) overloads that colour's meaning on screen
  // and repaints the badge whenever the semantic token is retuned. The
  // declaration is checked too — an undeclared var() silently paints nothing.
  it("colors every badge from a declared data-palette token", () => {
    const styles = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");
    const declared = [...styles.matchAll(/(--pigui-data-[a-z-]+)\s*:/g)].map((match) => match[1]);

    const step = (kind: string): TrajectoryStep => ({ id: "s", turnIndex: 0, stepIndex: 0, kind });
    const badges: Array<[TrajectoryStep, TrajectoryRole]> = [
      [step("config"), "annotation"],
      [step("tool"), "assistant"],
      [step("text"), "user"],
      [step("text"), "assistant"],
    ];

    for (const [trajectoryStep, role] of badges) {
      const { label, color } = trajectoryStepType(trajectoryStep, role);
      const token = /^var\((--pigui-data-[a-z-]+)\)$/.exec(color)?.[1];

      expect(token, `${label} badge is painted with ${color}`).toBeDefined();
      expect(declared).toContain(token);
    }
  });
});
