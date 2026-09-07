import type { ComponentProps, ReactNode } from "react";
import {
  ChatMessage as AstryxChatMessage,
  ChatMessageBubble as AstryxChatMessageBubble,
} from "@astryxdesign/core/Chat";
import { Copy, ThumbsDown, ThumbsUp } from "@/shared/ui/icons";

type MessageSectionProps = ComponentProps<"div">;

/* Sender wrappers delegate alignment and density to Astryx ChatMessage;
   the data-slot contract stays on the Astryx root (rest props pass through). */
function ChatMessageUser({ children, className = "", ...rest }: MessageSectionProps) {
  return (
    <AstryxChatMessage
      className={`chat-message ${className}`.trim()}
      data-slot="chat-message-user"
      sender="user"
      {...rest}
    >
      {children}
    </AstryxChatMessage>
  );
}

function ChatMessageAssistant({ children, className = "", ...rest }: MessageSectionProps) {
  return (
    <AstryxChatMessage
      className={`chat-message ${className}`.trim()}
      data-slot="chat-message-assistant"
      sender="assistant"
      {...rest}
    >
      {children}
    </AstryxChatMessage>
  );
}

/* Filled bubble; the sender-colored background comes from ChatMessage context. */
function ChatMessageBubble({ children, className = "", ...rest }: MessageSectionProps) {
  return (
    <AstryxChatMessageBubble
      className={className || undefined}
      data-slot="chat-message-bubble"
      {...rest}
    >
      {children}
    </AstryxChatMessageBubble>
  );
}

function ChatMessageBody({ children, className = "", ...rest }: MessageSectionProps) {
  return (
    <div
      className={`chat-message__body ${className}`.trim()}
      data-slot="chat-message-body"
      {...rest}
    >
      {children}
    </div>
  );
}

function ChatMessageContent({ children, className = "", ...rest }: MessageSectionProps) {
  return (
    <div
      className={`chat-message__content ${className}`.trim()}
      data-slot="chat-message-content"
      {...rest}
    >
      {children}
    </div>
  );
}

type ChatMessageActionOwnProps = {
  "aria-label": string;
  tooltip?: string;
  onPress?: () => void;
  children?: ReactNode;
};

type ChatMessageActionProps = Omit<
  ComponentProps<"button">,
  keyof ChatMessageActionOwnProps | "onClick" | "type"
> &
  ChatMessageActionOwnProps;

function ChatMessageAction({
  "aria-label": ariaLabel,
  tooltip,
  onPress,
  children,
  className = "",
  ...rest
}: ChatMessageActionProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={`chat-message__action ${className}`.trim()}
      data-slot="chat-message-action"
      title={tooltip}
      type="button"
      onClick={onPress}
      {...rest}
    >
      {children}
    </button>
  );
}

export function ChatMessageActions({ children, className = "", ...rest }: MessageSectionProps) {
  return (
    <div
      className={`chat-message__actions ${className}`.trim()}
      data-slot="chat-message-actions"
      {...rest}
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
