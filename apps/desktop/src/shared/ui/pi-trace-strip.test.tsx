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

// Run 1's model call was measured by the parser (5s); Run 2's was not, so it
// falls back to the turn-gap estimate.
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
    modelDurationMs: 5_000,
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

    // The parser's 5s, not the 13s left over from the 16s turn gap.
    expect(model[0]).toMatchObject({ durationSec: 5, isEstimatedDuration: false });
    expect(model[1].isEstimatedDuration).toBe(true);
    expect(tools[0]).toMatchObject({ durationSec: 3, isEstimatedDuration: false });
  });

  it("clamps extreme measured spans for layout while the tooltip keeps the real value", () => {
    // A 40-minute think must not squeeze every other column into a sliver, and a
    // 200ms call must stay wide enough to hit.
    const turns: SessionTurn[] = [
      {
        kind: "message",
        role: "user",
        timestamp: "2026-03-22T14:00:00.000Z",
        parts: [{ partType: "text", text: "Long one", payload: {} }],
      },
      {
        kind: "message",
        role: "assistant",
        modelDurationMs: 2_400_000,
        timestamp: "2026-03-22T14:40:00.000Z",
        parts: [{ partType: "text", text: "Deep think", payload: {} }],
      },
      {
        kind: "message",
        role: "user",
        timestamp: "2026-03-22T14:40:10.000Z",
        parts: [{ partType: "text", text: "Short one", payload: {} }],
      },
      {
        kind: "message",
        role: "assistant",
        modelDurationMs: 200,
        timestamp: "2026-03-22T14:40:11.000Z",
        parts: [{ partType: "text", text: "Quick", payload: {} }],
      },
    ];
    render(
      <PiTraceStrip
        turns={buildTraceTurns(turns)}
        widthMode="duration"
        onSelect={() => {}}
        onWidthModeChange={() => {}}
      />,
    );

    const longest = screen.getByRole("option", { name: "Run 1 model" });
    const shortest = screen.getByRole("option", { name: "Run 2 model" });

    expect(longest.style.flexGrow).toBe("300");
    expect(longest.getAttribute("title")).toContain("2400s");
    expect(shortest.style.flexGrow).toBe("0.5");
    expect(shortest.getAttribute("title")).toContain("0.2s");
  });

  it("discloses that a multi-group turn's model segments split one measured span", () => {
    const turns: SessionTurn[] = [
      {
        kind: "message",
        role: "user",
        timestamp: "2026-03-22T14:41:00.000Z",
        parts: [{ partType: "text", text: "Split run", payload: {} }],
      },
      {
        kind: "message",
        role: "assistant",
        modelDurationMs: 12_000,
        timestamp: "2026-03-22T14:41:20.000Z",
        parts: [
          { partType: "thinking", text: "Plan.", payload: {} },
          { partType: "toolCall", name: "bash", payload: { id: "c1", arguments: {} } },
          {
            partType: "toolResult",
            name: "bash",
            text: "ok",
            durationMs: 1_000,
            payload: { toolCallId: "c1" },
          },
          { partType: "text", text: "Done.", payload: {} },
        ],
      },
    ];
    render(
      <PiTraceStrip
        turns={buildTraceTurns(turns)}
        widthMode="duration"
        onSelect={() => {}}
        onWidthModeChange={() => {}}
      />,
    );

    const shares = screen.getAllByRole("option", { name: "Run 1 model" });

    expect(shares).toHaveLength(2);
    for (const share of shares) {
      expect(share.getAttribute("title")).toContain("6s · even share of measured 12s");
      // The span itself is measured, so it stays solid — hatching is reserved
      // for a duration that is a guess.
      expect(share).not.toHaveAttribute("data-estimated-width");
    }
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
