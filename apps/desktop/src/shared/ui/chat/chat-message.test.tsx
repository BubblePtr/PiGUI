import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatMessage, ChatMessageActions } from "@/shared/ui/chat/chat-message";
import { GitBranch } from "@/shared/ui/icons";

describe("ChatMessage", () => {
  it("renders a user message with bubble, content, and actions slots", () => {
    const { container } = render(
      <ChatMessage.User>
        <ChatMessage.Bubble>
          <ChatMessage.Content>Hi there</ChatMessage.Content>
        </ChatMessage.Bubble>
        <ChatMessageActions>
          <ChatMessageActions.Copy aria-label="Copy" tooltip="Copy" onPress={() => {}} />
        </ChatMessageActions>
      </ChatMessage.User>,
    );

    const user = container.querySelector('[data-slot="chat-message-user"]');

    expect(user).toBeInTheDocument();
    // Alignment and density come from the Astryx sender-aware wrapper.
    expect(user).toHaveClass("astryx-chat-message");
    expect(user).toHaveAttribute("data-sender", "user");
    expect(
      user?.querySelector('[data-slot="chat-message-bubble"]'),
    ).toHaveClass("astryx-chat-message-bubble");
    expect(user?.querySelector('[data-slot="chat-message-bubble"]')).toBeInTheDocument();
    expect(user?.querySelector('[data-slot="chat-message-content"]')).toBeInTheDocument();
    expect(user?.querySelector('[data-slot="chat-message-actions"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("renders an assistant message with a body slot and feedback actions", () => {
    const { container } = render(
      <ChatMessage.Assistant>
        <ChatMessage.Body>
          <ChatMessage.Content>Answer</ChatMessage.Content>
          <ChatMessageActions>
            <ChatMessageActions.ThumbsUp aria-label="Good response" tooltip="Good response" />
            <ChatMessageActions.ThumbsDown aria-label="Bad response" tooltip="Bad response" />
          </ChatMessageActions>
        </ChatMessage.Body>
      </ChatMessage.Assistant>,
    );

    const assistant = container.querySelector('[data-slot="chat-message-assistant"]');

    expect(assistant).toBeInTheDocument();
    expect(assistant).toHaveClass("astryx-chat-message");
    expect(assistant).toHaveAttribute("data-sender", "assistant");
    expect(assistant?.querySelector('[data-slot="chat-message-body"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Good response" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bad response" })).toBeInTheDocument();
  });

  it("can keep assistant actions visible after the turn settles", () => {
    const { container } = render(
      <ChatMessage.Assistant>
        <ChatMessage.Body>
          <ChatMessage.Content>Done</ChatMessage.Content>
          <ChatMessageActions className="chat-message__actions--persist">
            <ChatMessageActions.Copy aria-label="Copy" />
          </ChatMessageActions>
        </ChatMessage.Body>
      </ChatMessage.Assistant>,
    );

    expect(container.querySelector('[data-slot="chat-message-actions"]')).toHaveClass(
      "chat-message__actions--persist",
    );
  });

  it("fires onPress for custom actions", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();

    render(
      <ChatMessageActions>
        <ChatMessage.Action aria-label="Fork from message" tooltip="Fork from message" onPress={onPress}>
          <GitBranch />
        </ChatMessage.Action>
      </ChatMessageActions>,
    );

    await user.click(screen.getByRole("button", { name: "Fork from message" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
