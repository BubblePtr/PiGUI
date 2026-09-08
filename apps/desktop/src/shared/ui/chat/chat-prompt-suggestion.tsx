import type { ComponentProps, ReactNode } from "react";
import { ArrowUp } from "@/shared/ui/icons";

export type ChatPromptSuggestionProps = ComponentProps<"div">;

export function ChatPromptSuggestion({
  children,
  className = "",
  ...rest
}: ChatPromptSuggestionProps) {
  return (
    <div
      className={`prompt-suggestion prompt-suggestion--pill ${className}`.trim()}
      data-slot="prompt-suggestion"
      {...rest}
    >
      {children}
    </div>
  );
}

function ChatPromptSuggestionItems({
  children,
  className = "",
  ...rest
}: ComponentProps<"div">) {
  return (
    <div
      className={`prompt-suggestion__items prompt-suggestion__items--pill ${className}`.trim()}
      data-slot="prompt-suggestion-items"
      {...rest}
    >
      {children}
    </div>
  );
}

type ChatPromptSuggestionItemOwnProps = {
  children: ReactNode;
  showEndIcon?: boolean;
  onPress?: () => void;
};

type ChatPromptSuggestionItemProps = Omit<
  ComponentProps<"button">,
  keyof ChatPromptSuggestionItemOwnProps | "onClick" | "type"
> &
  ChatPromptSuggestionItemOwnProps;

function ChatPromptSuggestionItem({
  children,
  className = "",
  showEndIcon = true,
  onPress,
  ...rest
}: ChatPromptSuggestionItemProps) {
  return (
    <button
      className={`prompt-suggestion__item ${className}`.trim()}
      data-slot="prompt-suggestion-item"
      type="button"
      onClick={onPress}
      {...rest}
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
