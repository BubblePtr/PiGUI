import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatChainOfThought } from "@/shared/ui/chat/chat-chain-of-thought";

function renderTrace({
  defaultExpanded,
  isStreaming,
}: {
  defaultExpanded?: boolean;
  isStreaming?: boolean;
} = {}) {
  return render(
    <ChatChainOfThought defaultExpanded={defaultExpanded} isStreaming={isStreaming}>
      <ChatChainOfThought.Trigger>
        {isStreaming ? "Thinking..." : "Thought for 3s"}
      </ChatChainOfThought.Trigger>
      <ChatChainOfThought.Content>
        <ChatChainOfThought.Steps>
          <ChatChainOfThought.Step label="Thinking">
            Reasoning body text
          </ChatChainOfThought.Step>
        </ChatChainOfThought.Steps>
      </ChatChainOfThought.Content>
    </ChatChainOfThought>,
  );
}

describe("ChatChainOfThought", () => {
  it("renders the chain-of-thought slots with a collapsible trigger", () => {
    const { container } = renderTrace({ defaultExpanded: true, isStreaming: true });

    expect(container.querySelector('[data-slot="chain-of-thought"]')).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-slot="chain-of-thought-step"]'),
    ).toHaveLength(1);

    const trigger = screen.getByRole("button", { name: "Thinking..." });

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByText("Reasoning body text")).toBeInTheDocument();
  });

  it("keeps collapsed step content in the DOM but hidden", () => {
    renderTrace({ defaultExpanded: false });

    const trigger = screen.getByRole("button", { name: "Thought for 3s" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // The content stays queryable (tests and find-in-page rely on it).
    expect(screen.getByText("Reasoning body text")).toBeInTheDocument();
  });

  it("toggles expansion from the trigger", async () => {
    const user = userEvent.setup();

    renderTrace({ defaultExpanded: false });

    const trigger = screen.getByRole("button", { name: "Thought for 3s" });

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
