import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatTool } from "@/shared/ui/chat/chat-tool";

describe("ChatTool", () => {
  it("renders an Astryx tool-call row, keeping details unmounted while collapsed", () => {
    const { container } = render(
      <ChatTool
        argsText='{"path":"AGENTS.md"}'
        output="Agent instructions loaded."
        state="output-available"
        toolCallId="tool-call-1"
        toolName="read"
      />,
    );

    const tool = container.querySelector('[data-slot="chat-tool"]');

    expect(tool).toBeInTheDocument();
    expect(tool).toHaveAttribute("data-state", "output-available");
    expect(tool).toHaveAttribute("data-tool-call-id", "tool-call-1");
    expect(tool).toHaveTextContent("read");
    expect(tool).not.toHaveTextContent('{"path":"AGENTS.md"}');
    expect(tool).not.toHaveTextContent("Agent instructions loaded.");
  });

  it("reveals args and output when the row is expanded", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ChatTool
        argsText='{"path":"AGENTS.md"}'
        output="Agent instructions loaded."
        state="output-available"
        toolName="read"
      />,
    );

    const row = screen.getByRole("button", { name: /read/ });
    expect(row).toHaveAttribute("aria-expanded", "false");

    await user.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector('[data-slot="chat-tool-args"]')).toHaveTextContent(
      '{"path":"AGENTS.md"}',
    );
    expect(container.querySelector('[data-slot="chat-tool-result"]')).toHaveTextContent(
      "Agent instructions loaded.",
    );
  });

  it("keeps a row without args or output non-expandable", () => {
    render(<ChatTool state="input-streaming" toolName="search" />);

    expect(screen.queryByRole("button", { name: /search/ })).not.toBeInTheDocument();
  });

  it("surfaces the output as the accessible error message when the tool failed", () => {
    const { container } = render(
      <ChatTool
        argsText="{}"
        output="ENOENT: file not found"
        state="output-error"
        toolName="read"
      />,
    );

    const tool = container.querySelector('[data-slot="chat-tool"]');

    expect(tool).toHaveAttribute("data-state", "output-error");
    // Astryx renders errorMessage as visually hidden row text for a11y.
    expect(screen.getAllByText(/ENOENT: file not found/).length).toBeGreaterThan(0);
  });
});
