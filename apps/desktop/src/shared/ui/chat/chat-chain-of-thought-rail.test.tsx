import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ChatChainOfThoughtRail,
  type ChainOfThoughtRailPart,
} from "@/shared/ui/chat/chat-chain-of-thought-rail";

const parts: ChainOfThoughtRailPart[] = [
  { kind: "thinking", id: "t1", text: "Reading the projection first.", durationMs: 8200 },
  {
    kind: "tool",
    id: "c1",
    tool: {
      toolName: "Read",
      toolCallId: "call_1",
      state: "output-available",
      durationMs: 320,
      argsText: JSON.stringify({ path: "packages/backend/src/workspace/fork.ts" }),
      output: "77  remapEntryId(part.piEntryId)",
    },
  },
  {
    kind: "tool",
    id: "c2",
    tool: {
      toolName: "Bash",
      toolCallId: "call_2",
      state: "output-error",
      durationMs: 12400,
      argsText: JSON.stringify({ command: "bun test packages/backend" }),
      output: "1 tests failed",
    },
  },
  { kind: "thinking", id: "t2", text: "Root cause confirmed, fixing.", durationMs: 2100 },
];

describe("ChatChainOfThoughtRail", () => {
  it("groups think→tool loops into labeled rounds with distinct node kinds", () => {
    const { container } = render(
      <ChatChainOfThoughtRail defaultExpanded parts={parts} summary="Thought for 23s" />,
    );

    expect(
      container.querySelector('[data-slot="chain-of-thought-rail"]'),
    ).toBeInTheDocument();
    expect(screen.getByText("Round 1")).toBeInTheDocument();
    expect(screen.getByText("Round 2")).toBeInTheDocument();

    const nodes = container.querySelectorAll('[data-slot="chain-of-thought-rail-node"]');
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toHaveAttribute("data-kind", "thinking");
    expect(nodes[1]).toHaveAttribute("data-kind", "tool");
  });

  it("shows tool name, extracted target, duration, and error state", () => {
    const { container } = render(
      <ChatChainOfThoughtRail defaultExpanded parts={parts} summary="Thought for 23s" />,
    );

    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("packages/backend/src/workspace/fork.ts")).toBeInTheDocument();
    expect(screen.getByText("320ms")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="chain-of-thought-rail-node"][data-state="output-error"]'),
    ).toBeInTheDocument();
  });

  it("reveals args and output when a tool row is expanded", async () => {
    const user = userEvent.setup();
    render(
      <ChatChainOfThoughtRail defaultExpanded parts={parts} summary="Thought for 23s" />,
    );

    const detail = screen.getByText("77 remapEntryId(part.piEntryId)", { exact: false });
    expect(detail.closest("details")).not.toHaveAttribute("open");

    await user.click(screen.getByText("Read"));

    expect(detail.closest("details")).toHaveAttribute("open");
  });

  it("collapses by default when settled and toggles from the trigger", async () => {
    const user = userEvent.setup();
    render(<ChatChainOfThoughtRail parts={parts} summary="Thought for 23s" />);

    const trigger = screen.getByRole("button", { name: "Thought for 23s" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("streams: expands by default and shimmers the trigger label", () => {
    const { container } = render(
      <ChatChainOfThoughtRail
        isStreaming
        parts={parts}
        summary="Thought for 23s"
      />,
    );

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveTextContent("Thinking…");
    expect(container.querySelector('[data-slot="text-shimmer"]')).toBeInTheDocument();
  });
});
