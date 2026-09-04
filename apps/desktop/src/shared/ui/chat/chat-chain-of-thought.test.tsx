import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatChainOfThought,
  formatWorkedFor,
} from "@/shared/ui/chat/chat-chain-of-thought";
import { ChatThoughtMarkdown } from "@/shared/ui/chat/chat-thought-markdown";
import type { CotPhase } from "@/entities/session/cot-view";

describe("formatWorkedFor", () => {
  it("claims no number when the wait was never measured", () => {
    expect(formatWorkedFor(undefined)).toBe("Worked");
    expect(formatWorkedFor(Number.NaN)).toBe("Worked");
  });

  it("rounds a measured wait to at least one second", () => {
    expect(formatWorkedFor(400)).toBe("Worked for 1s");
    expect(formatWorkedFor(16_400)).toBe("Worked for 16s");
  });

  it("splits into minutes once the wait reaches a minute", () => {
    expect(formatWorkedFor(59_400)).toBe("Worked for 59s");
    expect(formatWorkedFor(59_600)).toBe("Worked for 1m 0s");
    expect(formatWorkedFor(75_400)).toBe("Worked for 1m 15s");
    expect(formatWorkedFor(3_599_400)).toBe("Worked for 59m 59s");
  });

  it("splits into hours once the wait reaches an hour", () => {
    expect(formatWorkedFor(3_599_600)).toBe("Worked for 1h 0m 0s");
    expect(formatWorkedFor(3_665_000)).toBe("Worked for 1h 1m 5s");
    expect(formatWorkedFor(7_322_400)).toBe("Worked for 2h 2m 2s");
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

  it("opens the settled list from its header", async () => {
    const user = userEvent.setup();

    renderPhase("settled", { elapsedMs: 16_400 });

    const trigger = screen.getByRole("button", { name: "Worked for 16s" });

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
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

  // Replay fixtures and retry gaps carry no anchor; a clock started at mount
  // would pass the time since the page opened off as the run's wait, and a
  // frozen "0.0s" would claim the run just started (ADR-0030 §6).
  it("shows no clock at all when the anchor is missing", () => {
    vi.useFakeTimers();

    const { container } = renderPhase("thinking");

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(container.querySelector('[data-slot="chat-status-line"]')).toBeInTheDocument();
    expect(container.querySelector(".chat-status-line__clock")).not.toBeInTheDocument();
  });
});

// Two layout premises the ADR-0030 prototype tripped over: the block contains
// its own inline size so a nowrap step row cannot burst the chat column, and
// the message body is stretched because nothing inside it asks for width any
// more. jsdom applies no stylesheet, so the rules are asserted at their source
// — both were checked in a browser against the real Astryx message layout.
describe("Chain of Thought layout rules", () => {
  const css = readFileSync(
    join(process.cwd(), "apps/desktop/src/shared/ui/chat/chat.css"),
    "utf8",
  );

  it("contains the block's inline size", () => {
    expect(css).toMatch(/\.chain-of-thought \{[^}]*contain: inline-size;/);
  });

  it("stretches an assistant message body that holds one", () => {
    expect(css).toMatch(
      /\.chat-message__body:has\(> \.chain-of-thought\) \{[^}]*align-self: stretch;/,
    );
  });
});
