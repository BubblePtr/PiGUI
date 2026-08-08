import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatCodeBlock } from "@/shared/ui/chat/chat-code-block";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatCodeBlock", () => {
  it("renders the code as plain text before highlighting settles", () => {
    render(<ChatCodeBlock code={'const answer = 42;'} language="ts" />);

    const root = screen.getByTestId("chat-code-block");

    expect(root).toHaveAttribute("data-slot", "chat-code-block");
    expect(root).toHaveTextContent("const answer = 42;");
  });

  it("falls back to plain text for unknown languages", async () => {
    render(<ChatCodeBlock code="plain body" language="not-a-language" />);

    expect(screen.getByTestId("chat-code-block")).toHaveTextContent("plain body");
    // The unknown language must never reject into an error surface.
    await waitFor(() => {
      expect(screen.getByTestId("chat-code-block")).toHaveTextContent("plain body");
    });
  });

  it("copies the code to the clipboard", () => {
    const writeText = vi.fn(async () => {});

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ChatCodeBlock code="copy me" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    expect(writeText).toHaveBeenCalledWith("copy me");
  });
});
