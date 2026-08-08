import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatCodeBlock } from "@/shared/ui/chat/chat-code-block";

describe("ChatCodeBlock", () => {
  it("renders code through the Astryx CodeBlock", () => {
    render(<ChatCodeBlock code={'const answer = 42;'} language="ts" />);

    const root = screen.getByTestId("chat-code-block");

    expect(root).toHaveAttribute("data-slot", "chat-code-block");
    expect(root.querySelector(".astryx-codeblock")).toBeInTheDocument();
    expect(root).toHaveTextContent("const answer = 42;");
  });

  it("renders unknown languages as plain text without erroring", () => {
    render(<ChatCodeBlock code="plain body" language="not-a-language" />);

    expect(screen.getByTestId("chat-code-block")).toHaveTextContent("plain body");
  });

  it("defaults to plaintext when no language is given", () => {
    render(<ChatCodeBlock code="no language" />);

    expect(screen.getByTestId("chat-code-block")).toHaveTextContent("no language");
  });

  it("exposes the Astryx copy button", () => {
    render(<ChatCodeBlock code="copy me" />);

    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });
});
