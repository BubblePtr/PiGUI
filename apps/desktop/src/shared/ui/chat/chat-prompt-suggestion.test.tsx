import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatPromptSuggestion } from "@/shared/ui/chat/chat-prompt-suggestion";

describe("ChatPromptSuggestion", () => {
  it("renders pill-styled suggestion slots", () => {
    const { container } = render(
      <ChatPromptSuggestion className="max-w-[35rem]">
        <ChatPromptSuggestion.Items>
          <ChatPromptSuggestion.Item onPress={() => {}}>
            Design a launch page
          </ChatPromptSuggestion.Item>
        </ChatPromptSuggestion.Items>
      </ChatPromptSuggestion>,
    );

    const root = container.querySelector('[data-slot="prompt-suggestion"]');
    const items = container.querySelector('[data-slot="prompt-suggestion-items"]');

    expect(root).toHaveClass("prompt-suggestion--pill", "max-w-[35rem]");
    expect(items).toHaveClass("prompt-suggestion__items--pill");
    expect(
      screen.getByRole("button", { name: "Design a launch page" }),
    ).toBeInTheDocument();
  });

  it("hides the end icon when showEndIcon is false", () => {
    const { container } = render(
      <ChatPromptSuggestion>
        <ChatPromptSuggestion.Items>
          <ChatPromptSuggestion.Item showEndIcon={false} onPress={() => {}}>
            No icon
          </ChatPromptSuggestion.Item>
          <ChatPromptSuggestion.Item onPress={() => {}}>With icon</ChatPromptSuggestion.Item>
        </ChatPromptSuggestion.Items>
      </ChatPromptSuggestion>,
    );

    const [withoutIcon, withIcon] = Array.from(
      container.querySelectorAll('[data-slot="prompt-suggestion-item"]'),
    );

    expect(withoutIcon?.querySelector(".prompt-suggestion__item-end-icon")).toBeNull();
    expect(withIcon?.querySelector(".prompt-suggestion__item-end-icon")).not.toBeNull();
  });

  it("fires onPress when a suggestion is chosen", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();

    render(
      <ChatPromptSuggestion>
        <ChatPromptSuggestion.Items>
          <ChatPromptSuggestion.Item onPress={onPress}>Pick me</ChatPromptSuggestion.Item>
        </ChatPromptSuggestion.Items>
      </ChatPromptSuggestion>,
    );

    await user.click(screen.getByRole("button", { name: "Pick me" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
