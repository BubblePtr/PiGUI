import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const bottomThresholdPx = 32;

/**
 * Stick-to-bottom behavior: stay pinned while the user is at the bottom,
 * release when they scroll up, and re-pin (auto-follow) once they return.
 * Content growth is observed via MutationObserver so streaming text keeps
 * the viewport glued to the latest message without fighting the user.
 */
function useStickToBottom(ref: RefObject<HTMLDivElement | null>, initial: "instant" | "smooth") {
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);

  const setPinnedState = useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinned(next);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const element = ref.current;

      if (!element) {
        return;
      }

      element.scrollTo({ top: element.scrollHeight, behavior });
      setPinnedState(true);
    },
    [ref, setPinnedState],
  );

  const handleScroll = useCallback(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    setPinnedState(distanceFromBottom <= bottomThresholdPx);
  }, [ref, setPinnedState]);

  useLayoutEffect(() => {
    scrollToBottom(initial === "instant" ? "auto" : "smooth");
    // Initial positioning only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof MutationObserver === "undefined") {
      return;
    }

    const observer = new MutationObserver(() => {
      if (pinnedRef.current) {
        scrollToBottom("auto");
      }
    });

    observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [ref, scrollToBottom]);

  return { handleScroll, pinned, scrollToBottom };
}

export function ChatConversation({
  children,
  className = "",
  initial = "instant",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  initial?: "instant" | "smooth";
  "aria-label"?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { handleScroll, pinned } = useStickToBottom(scrollRef, initial);

  return (
    <div
      ref={scrollRef}
      aria-label={ariaLabel}
      className={`chat-conversation ${className}`.trim()}
      data-pinned={String(pinned)}
      data-slot="chat-conversation"
      role="log"
      onScroll={handleScroll}
    >
      {children}
    </div>
  );
}

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

function ChatConversationScrollAnchor() {
  return (
    <div
      aria-hidden="true"
      className="chat-conversation__scroll-anchor"
      data-slot="chat-conversation-scroll-anchor"
    />
  );
}

ChatConversation.Content = ChatConversationContent;
ChatConversation.ScrollAnchor = ChatConversationScrollAnchor;
