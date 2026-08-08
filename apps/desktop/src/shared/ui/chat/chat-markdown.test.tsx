import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMarkdown, ChatStreamMarkdown } from "@/shared/ui/chat/chat-markdown";

describe("ChatMarkdown", () => {
  it("renders markdown children as rich text through Astryx Markdown", () => {
    render(<ChatMarkdown>{"Some **bold** text"}</ChatMarkdown>);

    const root = screen.getByTestId("markdown-renderer");

    expect(root).toHaveAttribute("data-slot", "chat-markdown");
    expect(root.querySelector(".astryx-markdown")).toBeInTheDocument();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("supports GFM tables", () => {
    render(<ChatMarkdown>{"| a | b |\n| - | - |\n| 1 | 2 |"}</ChatMarkdown>);

    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders fenced code with the Astryx built-in code block, not ChatCodeBlock", () => {
    const { container } = render(
      <ChatMarkdown>{"```ts\nconst x = 1;\n```"}</ChatMarkdown>,
    );

    expect(screen.queryByTestId("chat-code-block")).not.toBeInTheDocument();
    expect(container.querySelector(".astryx-markdown-codeblock")).toBeInTheDocument();
  });
});

describe("ChatStreamMarkdown", () => {
  it("marks the streaming state without a hand-drawn caret", async () => {
    const { container } = render(
      <ChatStreamMarkdown isStreaming>Streaming now</ChatStreamMarkdown>,
    );

    const root = screen.getByTestId("stream-markdown-renderer");

    expect(root).toHaveAttribute("data-is-streaming", "true");
    // Astryx incremental parsing reveals streamed chunks asynchronously.
    await waitFor(() => expect(root).toHaveTextContent("Streaming now"));
    expect(container.querySelector(".chat-markdown__caret")).not.toBeInTheDocument();
  });

  it("clears the streaming flag when the stream has settled", () => {
    render(<ChatStreamMarkdown>Settled</ChatStreamMarkdown>);

    expect(screen.getByTestId("stream-markdown-renderer")).toHaveAttribute(
      "data-is-streaming",
      "false",
    );
  });
});
