import type { ReactNode } from "react";
import { Copy, ThumbsDown, ThumbsUp } from "@/shared/ui/icons";

type MessageSectionProps = {
  children: ReactNode;
  className?: string;
};

function ChatMessageUser({ children, className = "" }: MessageSectionProps) {
  return (
    <div
      className={`chat-message chat-message--user ${className}`.trim()}
      data-slot="chat-message-user"
    >
      {children}
    </div>
  );
}

function ChatMessageAssistant({ children, className = "" }: MessageSectionProps) {
  return (
    <div
      className={`chat-message chat-message--assistant ${className}`.trim()}
      data-slot="chat-message-assistant"
    >
      {children}
    </div>
  );
}

function ChatMessageBubble({ children, className = "" }: MessageSectionProps) {
  return (
    <div
      className={`chat-message__bubble ${className}`.trim()}
      data-slot="chat-message-bubble"
    >
      {children}
    </div>
  );
}

function ChatMessageBody({ children, className = "" }: MessageSectionProps) {
  return (
    <div className={`chat-message__body ${className}`.trim()} data-slot="chat-message-body">
      {children}
    </div>
  );
}

function ChatMessageContent({ children, className = "" }: MessageSectionProps) {
  return (
    <div
      className={`chat-message__content ${className}`.trim()}
      data-slot="chat-message-content"
    >
      {children}
    </div>
  );
}

type ChatMessageActionProps = {
  "aria-label": string;
  tooltip?: string;
  onPress?: () => void;
  children?: ReactNode;
  className?: string;
};

function ChatMessageAction({
  "aria-label": ariaLabel,
  tooltip,
  onPress,
  children,
  className = "",
}: ChatMessageActionProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={`chat-message__action ${className}`.trim()}
      data-slot="chat-message-action"
      title={tooltip}
      type="button"
      onClick={onPress}
    >
      {children}
    </button>
  );
}

export function ChatMessageActions({ children, className = "" }: MessageSectionProps) {
  return (
    <div
      className={`chat-message__actions ${className}`.trim()}
      data-slot="chat-message-actions"
    >
      {children}
    </div>
  );
}

function ChatMessageActionsCopy(props: Omit<ChatMessageActionProps, "children">) {
  return (
    <ChatMessageAction {...props}>
      <Copy aria-hidden="true" size={16} />
    </ChatMessageAction>
  );
}

function ChatMessageActionsThumbsUp(props: Omit<ChatMessageActionProps, "children">) {
  return (
    <ChatMessageAction {...props}>
      <ThumbsUp aria-hidden="true" size={16} />
    </ChatMessageAction>
  );
}

function ChatMessageActionsThumbsDown(props: Omit<ChatMessageActionProps, "children">) {
  return (
    <ChatMessageAction {...props}>
      <ThumbsDown aria-hidden="true" size={16} />
    </ChatMessageAction>
  );
}

ChatMessageActions.Copy = ChatMessageActionsCopy;
ChatMessageActions.ThumbsUp = ChatMessageActionsThumbsUp;
ChatMessageActions.ThumbsDown = ChatMessageActionsThumbsDown;

export const ChatMessage = {
  User: ChatMessageUser,
  Assistant: ChatMessageAssistant,
  Bubble: ChatMessageBubble,
  Body: ChatMessageBody,
  Content: ChatMessageContent,
  Action: ChatMessageAction,
};
