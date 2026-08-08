import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMarkdown, ChatStreamMarkdown } from "@/shared/ui/chat/chat-markdown";

describe("ChatMarkdown", () => {
  it("renders markdown children as rich text", () => {
    render(<ChatMarkdown>{"Some **bold** text"}</ChatMarkdown>);

    const root = screen.getByTestId("markdown-renderer");

    expect(root).toHaveAttribute("data-slot", "chat-markdown");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("supports GFM tables", () => {
    render(<ChatMarkdown>{"| a | b |\n| - | - |\n| 1 | 2 |"}</ChatMarkdown>);

    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("ChatStreamMarkdown", () => {
  it("marks the streaming state and shows a caret while streaming", () => {
    const { container } = render(
      <ChatStreamMarkdown caret="block" isStreaming>
        Streaming now
      </ChatStreamMarkdown>,
    );

    const root = screen.getByTestId("stream-markdown-renderer");

    expect(root).toHaveAttribute("data-is-streaming", "true");
    expect(root).toHaveTextContent("Streaming now");
    expect(container.querySelector(".chat-markdown__caret")).toBeInTheDocument();
  });

  it("drops the caret when the stream has settled", () => {
    const { container } = render(
      <ChatStreamMarkdown caret="block">Settled</ChatStreamMarkdown>,
    );

    expect(screen.getByTestId("stream-markdown-renderer")).toHaveAttribute(
      "data-is-streaming",
      "false",
    );
    expect(container.querySelector(".chat-markdown__caret")).not.toBeInTheDocument();
  });
});
