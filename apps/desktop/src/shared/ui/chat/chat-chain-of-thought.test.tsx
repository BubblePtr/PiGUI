import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatChainOfThought,
  formatLiveElapsed,
  formatThoughtSummary,
  formatWorkedFor,
} from "@/shared/ui/chat/chat-chain-of-thought";
import type { CotPhase } from "@/entities/session/cot-view";
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
  it("claims no number when the duration was never measured", () => {
    expect(formatThoughtSummary(undefined)).toBe("Thought");
    expect(formatThoughtSummary(Number.NaN)).toBe("Thought");
    expect(formatThoughtSummary(-1)).toBe("Thought");
  });

  it("rounds known durations to at least one second", () => {
    expect(formatThoughtSummary(400)).toBe("Thought for 1s");
    expect(formatThoughtSummary(12_400)).toBe("Thought for 12s");
  });
});

describe("ChatChainOfThought", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
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

  it("renders a plain non-interactive label when there is nothing to expand", () => {
    const { container } = render(
      <ChatChainOfThought>
        <ChatChainOfThought.Label>Thought for 5s</ChatChainOfThought.Label>
      </ChatChainOfThought>,
    );

    const label = container.querySelector('[data-slot="chain-of-thought-label"]');

    expect(label).toHaveTextContent("Thought for 5s");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("toggles expansion from the trigger", async () => {
    const user = userEvent.setup();

    renderSettled({ defaultExpanded: false });

    const trigger = screen.getByRole("button", { name: "Thought for 3s" });

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("flips the live page when the page key changes", () => {
    const { container, rerender } = render(
      <ChatChainOfThought isStreaming>
        <ChatChainOfThought.Live pageKey="think:0">
          <p className="chain-of-thought__page">First line</p>
        </ChatChainOfThought.Live>
      </ChatChainOfThought>,
    );

    expect(container.querySelector("[data-motion]")).not.toBeInTheDocument();
    expect(screen.getByText("First line")).toBeInTheDocument();

    rerender(
      <ChatChainOfThought isStreaming>
        <ChatChainOfThought.Live pageKey="think:1">
          <p className="chain-of-thought__page">Second line</p>
        </ChatChainOfThought.Live>
      </ChatChainOfThought>,
    );

    expect(container.querySelector('[data-motion="out"]')).toHaveTextContent("First line");
    expect(container.querySelector('[data-motion="in"]')).toHaveTextContent("Second line");
  });

  it("swaps the live page immediately when reduced motion is preferred", () => {
    const matchMedia = vi.fn((query: string): MediaQueryList => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: matchMedia,
    });

    const { container, rerender } = render(
      <ChatChainOfThought isStreaming>
        <ChatChainOfThought.Live pageKey="think:0">
          <p className="chain-of-thought__page">First line</p>
        </ChatChainOfThought.Live>
      </ChatChainOfThought>,
    );

    rerender(
      <ChatChainOfThought isStreaming>
        <ChatChainOfThought.Live pageKey="think:1">
          <p className="chain-of-thought__page">Second line</p>
        </ChatChainOfThought.Live>
      </ChatChainOfThought>,
    );

    expect(container.querySelector("[data-motion]")).not.toBeInTheDocument();
    expect(screen.getByText("Second line")).toBeInTheDocument();
    expect(screen.queryByText("First line")).not.toBeInTheDocument();
  });

  it("updates the live page in place when the key is unchanged", () => {
    const { container, rerender } = render(
      <ChatChainOfThought isStreaming>
        <ChatChainOfThought.Live pageKey="think:0">
          <p className="chain-of-thought__page">Confirming fold</p>
        </ChatChainOfThought.Live>
      </ChatChainOfThought>,
    );

    rerender(
      <ChatChainOfThought isStreaming>
        <ChatChainOfThought.Live pageKey="think:0">
          <p className="chain-of-thought__page">Confirming fold winner logic</p>
        </ChatChainOfThought.Live>
      </ChatChainOfThought>,
    );

    expect(container.querySelector("[data-motion]")).not.toBeInTheDocument();
    expect(screen.getByText("Confirming fold winner logic")).toBeInTheDocument();
    expect(screen.queryByText("Confirming fold")).not.toBeInTheDocument();
  });
});

describe("formatWorkedFor", () => {
  it("claims no number when the wait was never measured", () => {
    expect(formatWorkedFor(undefined)).toBe("Worked");
    expect(formatWorkedFor(Number.NaN)).toBe("Worked");
  });

  it("rounds a measured wait to at least one second", () => {
    expect(formatWorkedFor(400)).toBe("Worked for 1s");
    expect(formatWorkedFor(16_400)).toBe("Worked for 16s");
  });
});

describe("ChatChainOfThought phase", () => {
  function renderPhase(phase: CotPhase, props: Record<string, unknown> = {}) {
    return render(
      <ChatChainOfThought phase={phase} {...props}>
        <ChatChainOfThought.Steps>
          <ChatChainOfThought.Step>
            <ChatThoughtMarkdown text="Reasoning body text" />
          </ChatChainOfThought.Step>
        </ChatChainOfThought.Steps>
      </ChatChainOfThought>,
    );
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing before the run's first model call", () => {
    const { container } = renderPhase("hidden");

    expect(container).toBeEmptyDOMElement();
  });

  // The list is flat while the run is in flight: the header only appears when
  // it settles, so the fold happens exactly once (ADR-0030 §3).
  it("lays the steps out flat with a status line while thinking", () => {
    const { container } = renderPhase("thinking", { elapsedMs: 26_400 });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Reasoning body text")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="chat-status-line"]')).toBeInTheDocument();
    expect(screen.getByText("26.4s")).toBeInTheDocument();
  });

  it("takes the status line down once the answer starts", () => {
    const { container } = renderPhase("answering", { elapsedMs: 26_400 });

    expect(container.querySelector('[data-slot="chat-status-line"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("folds into a closed 'Worked for Ns' header when the run settles", () => {
    renderPhase("settled", { elapsedMs: 16_400 });

    const trigger = screen.getByRole("button", { name: "Worked for 16s" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Reasoning body text")).toBeInTheDocument();
  });

  it("degrades to a plain label when the run left no steps", () => {
    render(<ChatChainOfThought elapsedMs={16_400} hasSteps={false} phase="settled" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Worked for 16s")).toBeInTheDocument();
  });

  it("ticks the live clock from the run's anchor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T04:00:00.000Z"));

    renderPhase("thinking", { startedAtMs: Date.now() - 2000 });

    expect(screen.getByText("2.0s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.getByText("3.2s")).toBeInTheDocument();
  });

  // Replay fixtures carry historical timestamps and no anchor; starting a clock
  // at mount would pass the time since the page opened off as the run's wait.
  it("does not start a clock of its own when the anchor is missing", () => {
    vi.useFakeTimers();

    renderPhase("thinking");

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("0.0s")).toBeInTheDocument();
  });
});
