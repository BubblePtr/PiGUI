import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AppLayout,
  ChainOfThought,
  CodeBlock,
  ChatConversation,
  ChatMessage,
  KPI,
  NativeSelect,
  PromptInput,
  Segment,
  Sidebar,
  Timeline,
} from "@heroui-pro/react";

describe("HeroUI Pro integration", () => {
  it("exposes the compound components planned for the Pig UI shell", () => {
    expect(AppLayout.Root).toBeTypeOf("function");
    expect(Sidebar.MenuItem).toBeTypeOf("function");
    expect(Segment.Item).toBeTypeOf("function");
    expect(NativeSelect.Trigger).toBeTypeOf("function");
    expect(KPI.Value).toBeTypeOf("function");
    expect(CodeBlock.Code).toBeTypeOf("function");
    expect(Timeline.Item).toBeTypeOf("function");
    expect(ChatConversation.Content).toBeTypeOf("function");
    expect(ChatMessage.Assistant).toBeTypeOf("function");
    expect(ChainOfThought.Step).toBeTypeOf("function");
    expect(PromptInput.Send).toBeTypeOf("function");
  });

  it("loads the HeroUI Pro CSS required by the Full Chat surface", () => {
    const source = readFileSync(
      join(process.cwd(), "src/styles.css"),
      "utf8",
    );

    expect(source).toContain("components/chat-conversation.css");
    expect(source).toContain("components/chat-message.css");
    expect(source).toContain("components/chain-of-thought.css");
    expect(source).toContain("components/prompt-input.css");
  });

  it("wraps Usage Segment controls in a shared element transition scope", () => {
    const source = readFileSync(
      join(process.cwd(), "src/usage.tsx"),
      "utf8",
    );

    expect(source).toContain("SharedElementTransition");
  });
});
