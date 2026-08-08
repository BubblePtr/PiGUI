import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
}

describe("ChatConversation", () => {
  it("renders a labelled log with content and scroll anchor slots", () => {
    render(
      <ChatConversation aria-label="Live Chat messages" initial="instant">
        <ChatConversation.Content>
          <p>Hello</p>
          <ChatConversation.ScrollAnchor />
        </ChatConversation.Content>
      </ChatConversation>,
    );

    const log = screen.getByLabelText("Live Chat messages");

    expect(log).toHaveAttribute("role", "log");
    expect(log).toHaveAttribute("data-slot", "chat-conversation");
    expect(
      log.querySelector('[data-slot="chat-conversation-content"]'),
    ).toBeInTheDocument();
    expect(
      log.querySelector('[data-slot="chat-conversation-scroll-anchor"]'),
    ).toBeInTheDocument();
  });

  it("stays pinned to the bottom while the user has not scrolled up", () => {
    render(
      <ChatConversation aria-label="Pinned">
        <ChatConversation.Content>
          <p>message</p>
        </ChatConversation.Content>
      </ChatConversation>,
    );

    const log = screen.getByLabelText("Pinned");

    mockScrollMetrics(log, { scrollHeight: 1000, clientHeight: 400 });
    log.scrollTop = 600; // exactly at the bottom
    fireEvent.scroll(log);

    expect(log).toHaveAttribute("data-pinned", "true");
  });

  it("releases the pin when the user scrolls up and re-pins at the bottom", () => {
    render(
      <ChatConversation aria-label="Released">
        <ChatConversation.Content>
          <p>message</p>
        </ChatConversation.Content>
      </ChatConversation>,
    );

    const log = screen.getByLabelText("Released");

    mockScrollMetrics(log, { scrollHeight: 1000, clientHeight: 400 });
    log.scrollTop = 100;
    fireEvent.scroll(log);

    expect(log).toHaveAttribute("data-pinned", "false");

    log.scrollTop = 600;
    fireEvent.scroll(log);

    expect(log).toHaveAttribute("data-pinned", "true");
  });

  it("scrolls new content into view only while pinned", async () => {
    vi.useFakeTimers();

    try {
      const { rerender } = render(
        <ChatConversation aria-label="Growing">
          <ChatConversation.Content>
            <p>first</p>
          </ChatConversation.Content>
        </ChatConversation>,
      );

      const log = screen.getByLabelText("Growing");
      const scrollTo = vi.fn();

      Object.defineProperty(log, "scrollTo", {
        configurable: true,
        value: scrollTo,
      });
      mockScrollMetrics(log, { scrollHeight: 1000, clientHeight: 400 });
      log.scrollTop = 100;
      fireEvent.scroll(log); // user scrolled up: released

      rerender(
        <ChatConversation aria-label="Growing">
          <ChatConversation.Content>
            <p>first</p>
            <p>second</p>
          </ChatConversation.Content>
        </ChatConversation>,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(scrollTo).not.toHaveBeenCalled();

      log.scrollTop = 600;
      fireEvent.scroll(log); // back at the bottom: re-pinned

      rerender(
        <ChatConversation aria-label="Growing">
          <ChatConversation.Content>
            <p>first</p>
            <p>second</p>
            <p>third</p>
          </ChatConversation.Content>
        </ChatConversation>,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(scrollTo).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
