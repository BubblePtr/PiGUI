import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatToolStep, summarizeTools } from "@/shared/ui/chat/chat-tool-step";
import type { ChatToolItem } from "@/shared/ui/chat/chat-tool";
import type { CotStep } from "@/entities/session/cot-view";

type ToolsStep = Extract<CotStep, { kind: "tools" }>;

function tool(overrides: Partial<ChatToolItem> = {}): ChatToolItem {
  return { state: "output-available", ...overrides };
}

function step(tools: ChatToolItem[], overrides: Partial<ToolsStep> = {}): ToolsStep {
  return { kind: "tools", id: "s1", live: false, tools, ...overrides };
}

describe("summarizeTools", () => {
  it("names what a single call acted on", () => {
    expect(
      summarizeTools([
        tool({
          toolName: "read",
          argsText: JSON.stringify({ path: "packages/backend/src/workspace/fork.ts" }),
        }),
      ]),
    ).toBe("Read packages/backend/src/workspace/fork.ts");
  });

  it("falls back to the verb when a call carries no target", () => {
    expect(summarizeTools([tool({ toolName: "read" })])).toBe("Read 1 file");
    expect(summarizeTools([tool({ toolName: "sleep" })])).toBe("Used sleep");
    expect(summarizeTools([tool()])).toBe("Used a tool");
  });

  // A path's news is its file name; a command's is the program it runs.
  it("keeps the tail of a long path and the head of a long command", () => {
    const path = `packages/backend/src/${"nested/".repeat(12)}fork.ts`;
    const command = `bun vitest run ${"apps/desktop/src/shared/ui/chat ".repeat(4)}`;

    const summarizedPath = summarizeTools([
      tool({ toolName: "read", argsText: JSON.stringify({ path }) }),
    ]);
    const summarizedCommand = summarizeTools([
      tool({ toolName: "bash", argsText: JSON.stringify({ command }) }),
    ]);

    expect(summarizedPath).toContain("Read …");
    expect(summarizedPath.endsWith("fork.ts")).toBe(true);
    expect(summarizedPath).not.toContain("packages/backend");
    expect(summarizedCommand).toContain("Ran bun vitest run");
    expect(summarizedCommand.endsWith("…")).toBe(true);
  });

  it("counts a burst by what its calls did, not by how many they were", () => {
    expect(
      summarizeTools([
        tool({ toolName: "bash" }),
        tool({ toolName: "edit" }),
        tool({ toolName: "bash" }),
        tool({ toolName: "edit" }),
        tool({ toolName: "edit" }),
      ]),
    ).toBe("Ran 2 commands, edited 3 files");
  });
});

describe("ChatToolStep", () => {
  it("names the call that is running while the burst is live", () => {
    const { container } = render(
      <ChatToolStep
        step={step(
          [
            tool({ toolCallId: "c1", toolName: "bash", state: "output-available" }),
            tool({ toolCallId: "c2", toolName: "read", state: "input-available" }),
          ],
          { live: true, activeToolCallId: "c2" },
        )}
      />,
    );

    expect(container.querySelector('[data-slot="text-shimmer"]')).toHaveTextContent("Running read…");
  });

  // The part stream carries no tool name until tool(start); the row still has
  // to say something truthful while the arguments stream in.
  it("says only 'Running…' before the call's name arrives", () => {
    const { container } = render(
      <ChatToolStep
        step={step([tool({ toolCallId: "c1", state: "input-streaming" })], {
          live: true,
          activeToolCallId: "c1",
        })}
      />,
    );

    expect(container.querySelector('[data-slot="text-shimmer"]')).toHaveTextContent("Running…");
  });

  it("settles into a verb summary with the failures and the total time", () => {
    render(
      <ChatToolStep
        step={step([
          tool({ toolCallId: "c1", toolName: "bash", durationMs: 500 }),
          tool({
            toolCallId: "c2",
            toolName: "bash",
            state: "output-error",
            durationMs: 250,
          }),
        ])}
      />,
    );

    expect(screen.getByText("Ran 2 commands")).toBeInTheDocument();
    expect(screen.getByText("1 failed")).toBeInTheDocument();
    expect(screen.getByText("750ms")).toBeInTheDocument();
  });

  it("expands to one production row per call", () => {
    const { container } = render(
      <ChatToolStep
        step={step([
          tool({ toolCallId: "c1", toolName: "bash" }),
          tool({ toolCallId: "c2", toolName: "read" }),
        ])}
      />,
    );

    const rows = container.querySelectorAll('[data-slot="chat-tool-group"]');

    expect(rows).toHaveLength(2);
    expect([...rows].every((row) => row.getAttribute("data-tool-count") === "1")).toBe(true);
  });
});
