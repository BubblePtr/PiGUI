import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatStatusLine, formatLiveElapsed, statusWord } from "@/shared/ui/chat/chat-status-line";

describe("formatLiveElapsed", () => {
  it("keeps sub-minute times to one decimal", () => {
    expect(formatLiveElapsed(2500)).toBe("2.5s");
  });

  it("splits minutes after 60 seconds", () => {
    expect(formatLiveElapsed(61_200)).toBe("1m 1.2s");
  });
});

describe("statusWord", () => {
  it("holds one word for the whole 4s interval", () => {
    expect(statusWord("thinking", 0)).toBe(statusWord("thinking", 3999));
  });

  it("moves on at the interval boundary", () => {
    expect(statusWord("thinking", 4000)).not.toBe(statusWord("thinking", 0));
  });

  it("draws from the phase's own vocabulary", () => {
    expect(statusWord("acting", 0)).not.toBe(statusWord("thinking", 0));
  });
});

describe("ChatStatusLine", () => {
  it("carries the heartbeat, a shimmering status word and the running clock", () => {
    const { container } = render(<ChatStatusLine elapsedMs={26_400} phase="acting" />);

    expect(container.querySelector('[data-slot="chat-pixel-loader"]')).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="text-shimmer"]')?.textContent,
    ).toBe(`${statusWord("acting", 26_400)}…`);
    expect(screen.getByText("26.4s")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  // A retry gap leaves the run alive with nothing anchored to measure from;
  // printing "0.0s" would claim the run just started (ADR-0030 §6).
  it("drops the clock when the run has nothing to measure from", () => {
    const { container } = render(<ChatStatusLine phase="thinking" />);

    expect(container.querySelector('[data-slot="chat-pixel-loader"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="text-shimmer"]')?.textContent).toBe(
      `${statusWord("thinking", 0)}…`,
    );
    expect(container.querySelector(".chat-status-line__clock")).not.toBeInTheDocument();
  });
});
