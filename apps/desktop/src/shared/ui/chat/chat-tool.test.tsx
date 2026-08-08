import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatTool } from "@/shared/ui/chat/chat-tool";

describe("ChatTool", () => {
  it("shows the trigger with prefix and state, keeping details unmounted while collapsed", () => {
    const { container } = render(
      <ChatTool
        argsText='{"path":"AGENTS.md"}'
        output="Agent instructions loaded."
        state="output-available"
        toolCallId="tool-call-1"
        toolName="read"
        triggerPrefix="Used tool: "
      />,
    );

    const tool = container.querySelector('[data-slot="chat-tool"]');

    expect(tool).toBeInTheDocument();
    expect(tool).toHaveAttribute("data-state", "output-available");
    expect(tool).toHaveTextContent("Used tool: read");
    expect(tool).not.toHaveTextContent('{"path":"AGENTS.md"}');
    expect(tool).not.toHaveTextContent("Agent instructions loaded.");
  });

  it("reveals args and output when expanded", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatTool
        argsText='{"path":"AGENTS.md"}'
        output="Agent instructions loaded."
        state="output-available"
        toolName="read"
        triggerPrefix="Used tool: "
      />,
    );

    await user.click(screen.getByRole("button", { name: /Used tool: read/ }));

    expect(container.querySelector('[data-slot="chat-tool-args"]')).toHaveTextContent(
      '{"path":"AGENTS.md"}',
    );
    expect(container.querySelector('[data-slot="chat-tool-result"]')).toHaveTextContent(
      "Agent instructions loaded.",
    );
  });

  it("starts expanded when defaultExpanded is set", () => {
    const { container } = render(
      <ChatTool
        argsText="{}"
        defaultExpanded
        state="input-available"
        toolName="search"
      />,
    );

    expect(container.querySelector('[data-slot="chat-tool-args"]')).toBeInTheDocument();
  });
});
