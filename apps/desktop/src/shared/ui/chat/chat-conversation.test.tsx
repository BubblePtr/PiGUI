import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatConversation } from "@/shared/ui/chat/chat-conversation";

function mockScrollMetrics(
  element: HTMLElement,
  { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
  Object.defineProperty(element, "offsetHeight", {
    configurable: true,
    get: () => clientHeight,
  });
}

function renderConversation(label = "Live Chat messages") {
  render(
    <ChatConversation aria-label={label}>
      <ChatConversation.Content>
        <p>Hello</p>
      </ChatConversation.Content>
    </ChatConversation>,
  );

  const root = document.querySelector<HTMLElement>('[data-slot="chat-conversation"]')!;
  const viewport = root.querySelector<HTMLElement>(
    '[data-slot="chat-conversation-viewport"]',
  )!;

  return { root, viewport };
}

describe("ChatConversation", () => {
  it("renders the Astryx message list as a labelled log inside a scroll viewport", () => {
    const { root, viewport } = renderConversation();

    const log = screen.getByLabelText("Live Chat messages");

    expect(log).toHaveAttribute("role", "log");
    expect(log).toHaveClass("astryx-chat-message-list");
    expect(viewport.contains(log)).toBe(true);
    expect(
      root.querySelector('[data-slot="chat-conversation-content"]'),
    ).toBeInTheDocument();
    expect(
      root.querySelector('[data-slot="chat-conversation-scroll-button"]'),
    ).toBeInTheDocument();
  });

  it("renders the scroll-to-bottom control icon-only, without visible label text", () => {
    renderConversation();

    const button = screen.getByRole("button", { name: "Scroll to bottom" });

    // The accessible name must not leak into the circular button as
    // clipped visible text (upstream facebook/astryx#4834).
    expect(button).toHaveTextContent("");
  });

  it("marks the log busy while streaming", () => {
    render(
      <ChatConversation aria-label="Busy" isStreaming>
        <ChatConversation.Content>
          <p>token</p>
        </ChatConversation.Content>
      </ChatConversation>,
    );

    expect(screen.getByLabelText("Busy")).toHaveAttribute("aria-busy", "true");
  });

  it("starts pinned and releases the pin when the user scrolls up", () => {
    const { root, viewport } = renderConversation("Released");

    expect(root).toHaveAttribute("data-pinned", "true");

    mockScrollMetrics(viewport, { scrollHeight: 1000, clientHeight: 400 });
    viewport.scrollTop = 600; // settle at the bottom first
    fireEvent.scroll(viewport);
    viewport.scrollTop = 100; // scrolling up unlocks immediately
    fireEvent.scroll(viewport);

    expect(root).toHaveAttribute("data-pinned", "false");
  });

  it("re-pins when scrolling settles at the bottom", () => {
    const { root, viewport } = renderConversation("Repinned");

    mockScrollMetrics(viewport, { scrollHeight: 1000, clientHeight: 400 });
    viewport.scrollTop = 600;
    fireEvent.scroll(viewport);
    viewport.scrollTop = 100;
    fireEvent.scroll(viewport);
    expect(root).toHaveAttribute("data-pinned", "false");

    viewport.scrollTop = 600; // back at the bottom
    fireEvent.scroll(viewport);
    fireEvent(viewport, new Event("scrollend"));

    expect(root).toHaveAttribute("data-pinned", "true");
  });
});
