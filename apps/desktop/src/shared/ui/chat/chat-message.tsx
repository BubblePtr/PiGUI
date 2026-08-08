import type { ReactNode } from "react";
import {
  ChatMessage as AstryxChatMessage,
  ChatMessageBubble as AstryxChatMessageBubble,
} from "@astryxdesign/core/Chat";
import { Copy, ThumbsDown, ThumbsUp } from "@/shared/ui/icons";

type MessageSectionProps = {
  children: ReactNode;
  className?: string;
};

/* Sender wrappers delegate alignment and density to Astryx ChatMessage;
   the data-slot contract stays on the Astryx root (rest props pass through). */
function ChatMessageUser({ children, className = "" }: MessageSectionProps) {
  return (
    <AstryxChatMessage
      className={`chat-message ${className}`.trim()}
      data-slot="chat-message-user"
      sender="user"
    >
      {children}
    </AstryxChatMessage>
  );
}

function ChatMessageAssistant({ children, className = "" }: MessageSectionProps) {
  return (
    <AstryxChatMessage
      className={`chat-message ${className}`.trim()}
      data-slot="chat-message-assistant"
      sender="assistant"
    >
      {children}
    </AstryxChatMessage>
  );
}

/* Filled bubble; the sender-colored background comes from ChatMessage context. */
function ChatMessageBubble({ children, className = "" }: MessageSectionProps) {
  return (
    <AstryxChatMessageBubble
      className={className || undefined}
      data-slot="chat-message-bubble"
    >
      {children}
    </AstryxChatMessageBubble>
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
