import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ChatThoughtMarkdown,
  liveThoughtBeatIndex,
  liveThoughtLine,
} from "@/shared/ui/chat/chat-thought-markdown";

describe("ChatThoughtMarkdown", () => {
  it("renders closed emphasis and code", () => {
    render(
      <ChatThoughtMarkdown text="Looking at `remapEntryId` — **toolCallId is never remapped**." />,
    );

    expect(screen.getByText("remapEntryId")).toBeInTheDocument();
    expect(screen.getByText("toolCallId is never remapped")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("hides an unclosed emphasis marker while streaming", () => {
    render(<ChatThoughtMarkdown text="Decision: confirm by reading **" />);

    expect(screen.getByText(/Decision: confirm by reading/)).toBeInTheDocument();
    expect(screen.queryByText("**")).not.toBeInTheDocument();
  });

  it("unwraps a whole-line **sentence** when asked", () => {
    const { container } = render(
      <ChatThoughtMarkdown unwrapLines text="**The failing assertion is in the test.**" />,
    );

    expect(container.querySelector("strong")).not.toBeInTheDocument();
    expect(screen.getByText("The failing assertion is in the test.")).toBeInTheDocument();
  });
});

describe("liveThoughtLine", () => {
  it("keeps a short single line", () => {
    expect(liveThoughtLine("Confirming fold winner logic.")).toBe(
      "Confirming fold winner logic.",
    );
    expect(liveThoughtBeatIndex("Confirming fold winner logic.")).toBe(0);
  });

  it("shows only the last line of a multiline think dump", () => {
    const text = [
      "Identifying illegal human raises risk",
      "Validating raise amounts and state resets",
      "Confirming fold winner logic consistency",
    ].join("\n");

    expect(liveThoughtLine(text)).toBe("Confirming fold winner logic consistency");
    expect(liveThoughtBeatIndex(text)).toBe(2);
  });

  it("pages a single paragraph on sentence boundaries", () => {
    const text =
      "The remap is missing. The fork dropped the tool call. Confirm the identity map.";

    expect(liveThoughtLine(text)).toBe("Confirm the identity map.");
    expect(liveThoughtBeatIndex(text)).toBe(2);
  });
});
