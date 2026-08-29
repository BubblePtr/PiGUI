import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatChainOfThought,
  formatLiveElapsed,
  formatThoughtSummary,
} from "@/shared/ui/chat/chat-chain-of-thought";
import { ChatThoughtMarkdown } from "@/shared/ui/chat/chat-thought-markdown";

function renderSettled({ defaultExpanded }: { defaultExpanded?: boolean } = {}) {
  return render(
    <ChatChainOfThought defaultExpanded={defaultExpanded}>
      <ChatChainOfThought.Trigger>Thought for 3s</ChatChainOfThought.Trigger>
      <ChatChainOfThought.Content>
        <ChatChainOfThought.Steps>
          <ChatChainOfThought.Step>
            <ChatThoughtMarkdown text="Reasoning body text" />
          </ChatChainOfThought.Step>
        </ChatChainOfThought.Steps>
      </ChatChainOfThought.Content>
    </ChatChainOfThought>,
  );
}

describe("formatLiveElapsed", () => {
  it("keeps sub-minute times to one decimal", () => {
    expect(formatLiveElapsed(2500)).toBe("2.5s");
  });

  it("splits minutes after 60 seconds", () => {
    expect(formatLiveElapsed(61_200)).toBe("1m 1.2s");
  });
});

describe("formatThoughtSummary", () => {
  it("falls back when duration is unknown", () => {
    expect(formatThoughtSummary(undefined)).toBe("Thought for 3s");
  });

  it("rounds known durations to at least one second", () => {
    expect(formatThoughtSummary(400)).toBe("Thought for 1s");
    expect(formatThoughtSummary(12_400)).toBe("Thought for 12s");
  });
});

describe("ChatChainOfThought", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams a live status and viewport without expanding the full trace", () => {
    const { container } = render(
      <ChatChainOfThought elapsedMs={2500} isStreaming>
        <ChatChainOfThought.Live>
          <p className="chain-of-thought__page">Current think line</p>
        </ChatChainOfThought.Live>
      </ChatChainOfThought>,
    );

    expect(container.querySelector('[data-slot="chain-of-thought"]')).toHaveAttribute(
      "data-streaming",
      "true",
    );
    expect(container.querySelector('[data-slot="chat-pixel-loader"]')).toBeInTheDocument();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(screen.getByText("2.5s")).toBeInTheDocument();
    expect(screen.getByText("Current think line")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thought for/ })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="chain-of-thought-steps"]')).not.toBeInTheDocument();
  });

  it("ticks live elapsed from mount when no clock props are passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T04:00:00.000Z"));

    render(
      <ChatChainOfThought isStreaming>
        <ChatChainOfThought.Live>
          <p className="chain-of-thought__page">Current think line</p>
        </ChatChainOfThought.Live>
      </ChatChainOfThought>,
    );

    expect(screen.getByText("0.0s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText("1.2s")).toBeInTheDocument();
  });

  it("keeps collapsed settled steps in the DOM but hidden, without a left rail", () => {
    const { container } = renderSettled({ defaultExpanded: false });

    const trigger = screen.getByRole("button", { name: "Thought for 3s" });
    const steps = container.querySelector('[data-slot="chain-of-thought-steps"]');

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Reasoning body text")).toBeInTheDocument();
    expect(steps).toBeInTheDocument();
    expect(steps).not.toHaveClass("chain-of-thought__steps--rail");
  });

  it("toggles expansion from the trigger", async () => {
    const user = userEvent.setup();

    renderSettled({ defaultExpanded: false });

    const trigger = screen.getByRole("button", { name: "Thought for 3s" });

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
});
