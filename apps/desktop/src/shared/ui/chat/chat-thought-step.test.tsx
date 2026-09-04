import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatThoughtStep } from "@/shared/ui/chat/chat-thought-step";
import type { CotStep } from "@/entities/session/cot-view";

type ThoughtStep = Extract<CotStep, { kind: "thinking" }>;

function step(overrides: Partial<ThoughtStep> = {}): ThoughtStep {
  return { kind: "thinking", id: "t1", live: false, text: "", ...overrides };
}

describe("ChatThoughtStep", () => {
  it("shimmers 'Thinking…' while live", () => {
    const { container } = render(<ChatThoughtStep step={step({ live: true, durationMs: 900 })} />);

    expect(container.querySelector('[data-slot="text-shimmer"]')).toHaveTextContent("Thinking…");
  });

  it("settles to the measured duration", () => {
    render(<ChatThoughtStep step={step({ durationMs: 2400 })} />);

    expect(screen.getByText(/Thought/)).toHaveTextContent("Thought 2s");
  });

  it("calls anything under a second brief instead of rounding it up", () => {
    render(<ChatThoughtStep step={step({ durationMs: 400 })} />);

    expect(screen.getByText(/Thought/)).toHaveTextContent("Thought briefly");
  });

  it("claims no number when the duration was never measured", () => {
    render(<ChatThoughtStep step={step()} />);

    expect(screen.getByText("Thought")).toBeInTheDocument();
  });

  // Providers often give a summary, a redacted block, or nothing at all — an
  // empty thinking part is a normal step, not a disclosure with nothing behind it.
  it("is a plain label with no control when there is no body", () => {
    render(<ChatThoughtStep step={step({ durationMs: 2400, text: "   " })} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("discloses the body when there is one", async () => {
    const user = userEvent.setup();

    render(
      <ChatThoughtStep step={step({ durationMs: 2400, text: "Checking the fork remap first." })} />,
    );

    const trigger = screen.getByRole("button", { name: /Thought 2s/ });

    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Checking the fork remap first.")).toBeInTheDocument();
  });
});
