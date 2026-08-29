import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatThoughtMarkdown } from "@/shared/ui/chat/chat-thought-markdown";

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
