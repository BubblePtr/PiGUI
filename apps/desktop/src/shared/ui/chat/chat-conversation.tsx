import { type ReactNode, useRef } from "react";
import {
  ChatMessageList,
  useChatNewMessages,
  useChatStreamScroll,
} from "@astryxdesign/core/Chat";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ChevronDown } from "@/shared/ui/icons";

/**
 * Scroll region for live chat. The Astryx stream-scroll stack owns the
 * behavior: spring follow while locked, direction-aware unlock, re-lock on
 * scrollend at the bottom, reduced-motion fallback. ChatMessageList owns
 * the log semantics (role, aria-live, aria-busy).
 */
export function ChatConversation({
  children,
  className = "",
  isStreaming = false,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  isStreaming?: boolean;
  "aria-label"?: string;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scroll = useChatStreamScroll({ scrollRef: viewportRef });
  const newMessages = useChatNewMessages({
    isLocked: scroll.isLocked,
    onResize: scroll.scrollIfLocked,
  });

  return (
    <div
      className={`chat-conversation ${className}`.trim()}
      data-pinned={String(scroll.isLocked)}
      data-slot="chat-conversation"
    >
      <div
        ref={viewportRef}
        className="chat-conversation__viewport"
        data-slot="chat-conversation-viewport"
      >
        <ChatMessageList
          ref={newMessages.contentRef}
          aria-label={ariaLabel}
          isStreaming={isStreaming}
        >
          {children}
        </ChatMessageList>
      </div>
      {/* Icon-only stand-in for ChatLayoutScrollButton, which renders its
          accessible label as clipped visible text (facebook/astryx#4834).
          Swap back once the upstream fix ships. */}
      <div
        className="chat-conversation__scroll-button"
        data-slot="chat-conversation-scroll-button"
        data-visible={String(scroll.isScrolledUp || newMessages.hasNewMessages)}
      >
        <IconButton
          icon={<ChevronDown aria-hidden="true" />}
          label="Scroll to bottom"
          size="md"
          variant="secondary"
          onClick={() => {
            newMessages.dismiss();
            scroll.scrollToBottom();
          }}
        />
      </div>
    </div>
  );
}

/** Width-constraint wrapper for the message column; spacing comes from the list. */
function ChatConversationContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`chat-conversation__content ${className}`.trim()}
      data-slot="chat-conversation-content"
    >
      {children}
    </div>
  );
}

ChatConversation.Content = ChatConversationContent;
