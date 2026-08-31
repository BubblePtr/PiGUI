import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionTurn } from "@pigui/core";
import { buildTraceTurns } from "@/entities/session/trace-model";
import { PiTraceStrip, stripSegmentsFromTurns } from "@/shared/ui/pi-trace-strip";

const sessionTurns: SessionTurn[] = [
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:41:00.000Z",
    parts: [{ partType: "text", text: "First question", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    timestamp: "2026-03-22T14:41:42.000Z",
    parts: [{ partType: "text", text: "First answer", payload: {} }],
  },
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:42:00.000Z",
    parts: [{ partType: "text", text: "Second question", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    timestamp: "2026-03-22T14:42:30.000Z",
    parts: [{ partType: "text", text: "Second answer", payload: {} }],
  },
];

// Run 1's model call is bracketed by Pi's start/end stamps (5s); Run 2's is not,
// so it falls back to the turn-gap estimate.
const mixedTimingTurns: SessionTurn[] = [
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:41:00.000Z",
    parts: [{ partType: "text", text: "Measured run", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    startTimestamp: "2026-03-22T14:41:09.000Z",
    timestamp: "2026-03-22T14:41:14.000Z",
    parts: [
      { partType: "thinking", text: "Plan it.", payload: {} },
      { partType: "toolCall", name: "bash", payload: { id: "c1", arguments: { command: "ls" } } },
      {
        partType: "toolResult",
        name: "bash",
        text: "src",
        durationMs: 3_000,
        payload: { toolCallId: "c1" },
      },
    ],
  },
  {
    kind: "message",
    role: "user",
    timestamp: "2026-03-22T14:41:30.000Z",
    parts: [{ partType: "text", text: "Estimated run", payload: {} }],
  },
  {
    kind: "message",
    role: "assistant",
    timestamp: "2026-03-22T14:41:40.000Z",
    parts: [{ partType: "text", text: "Legacy answer", payload: {} }],
  },
];

function renderStrip() {
  const onSelect = vi.fn();
  const onBrush = vi.fn();
  const utils = render(
    <PiTraceStrip
      turns={buildTraceTurns(sessionTurns)}
      widthMode="steps"
      onBrush={onBrush}
      onSelect={onSelect}
      onWidthModeChange={() => {}}
    />,
  );
  return { onSelect, onBrush, ...utils };
}

describe("PiTraceStrip", () => {
  it("selects the clicked swimlane block, not the whole run", async () => {
    const user = userEvent.setup();
    const { onSelect, onBrush } = renderStrip();

    await user.click(screen.getByRole("option", { name: "Run 1 model" }));

    expect(onSelect).toHaveBeenCalledWith(1, "t1-s0");
    expect(onBrush).toHaveBeenCalledWith([1, 1]);
  });

  it("dims columns outside the selected swimlane block", () => {
    render(
      <PiTraceStrip
        selectedRange={[1, 1]}
        turns={buildTraceTurns(sessionTurns)}
        widthMode="steps"
        onBrush={() => {}}
        onSelect={() => {}}
        onWidthModeChange={() => {}}
      />,
    );

    const options = screen.getAllByRole("option");
    const dimmed = options.filter((option) => option.hasAttribute("data-focus-dimmed"));
    const lit = options.filter((option) => !option.hasAttribute("data-focus-dimmed"));

    expect(lit).toHaveLength(1);
    expect(lit[0]).toHaveAttribute("aria-label", "Run 1 model");
    expect(dimmed.length).toBe(options.length - 1);
  });

  it("widths the model segment by the recorded model call, falling back to the estimate", () => {
    const segments = stripSegmentsFromTurns(buildTraceTurns(mixedTimingTurns));
    const model = segments.filter((segment) => segment.lane === "model");
    const tools = segments.filter((segment) => segment.lane === "tools");

    // 14:41:09 → 14:41:14, not the 13s left over from the 16s turn gap.
    expect(model[0]).toMatchObject({ durationSec: 5, isEstimatedDuration: false });
    expect(model[1].isEstimatedDuration).toBe(true);
    expect(tools[0]).toMatchObject({ durationSec: 3, isEstimatedDuration: false });
  });

  it("marks estimated columns only while the width encodes time", () => {
    function estimatedColumns() {
      return screen
        .getAllByRole("option")
        .filter((option) => option.hasAttribute("data-estimated-width"));
    }

    const props = {
      turns: buildTraceTurns(mixedTimingTurns),
      onBrush: () => {},
      onSelect: () => {},
      onWidthModeChange: () => {},
    };
    const { rerender } = render(<PiTraceStrip {...props} widthMode="duration" />);

    expect(estimatedColumns().map((option) => option.getAttribute("aria-label"))).toEqual([
      "Run 2 model",
    ]);
    expect(estimatedColumns()[0].getAttribute("title")).toContain("estimated");

    rerender(<PiTraceStrip {...props} widthMode="steps" />);

    expect(estimatedColumns()).toHaveLength(0);
  });

  it("leaves idle swimlanes unpainted so the strip does not read as a table", () => {
    renderStrip();

    const input = screen.getByRole("option", { name: "Run 1 input" });
    const lanes = [...input.querySelectorAll(":scope > span")].slice(0, 3);

    expect(lanes[0]).not.toHaveStyle({ background: "transparent" });
    expect(lanes[1]).toHaveStyle({ background: "transparent" });
    expect(lanes[2]).toHaveStyle({ background: "transparent" });
  });
});
