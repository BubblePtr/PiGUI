import type { ReactNode } from "react";
import { ArrowUp } from "@/shared/ui/icons";

export function ChatPromptSuggestion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`prompt-suggestion prompt-suggestion--pill ${className}`.trim()}
      data-slot="prompt-suggestion"
    >
      {children}
    </div>
  );
}

function ChatPromptSuggestionItems({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`prompt-suggestion__items prompt-suggestion__items--pill ${className}`.trim()}
      data-slot="prompt-suggestion-items"
    >
      {children}
    </div>
  );
}

function ChatPromptSuggestionItem({
  children,
  className = "",
  showEndIcon = true,
  onPress,
}: {
  children: ReactNode;
  className?: string;
  showEndIcon?: boolean;
  onPress?: () => void;
}) {
  return (
    <button
      className={`prompt-suggestion__item ${className}`.trim()}
      data-slot="prompt-suggestion-item"
      type="button"
      onClick={onPress}
    >
      {children}
      {showEndIcon ? (
        <span aria-hidden="true" className="prompt-suggestion__item-end-icon">
          <ArrowUp size={14} />
        </span>
      ) : null}
    </button>
  );
}

ChatPromptSuggestion.Items = ChatPromptSuggestionItems;
ChatPromptSuggestion.Item = ChatPromptSuggestionItem;
