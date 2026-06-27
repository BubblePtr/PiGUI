import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AppLayout } from "@heroui-pro/react/app-layout";
import { ChainOfThought } from "@heroui-pro/react/chain-of-thought";
import { CodeBlock } from "@heroui-pro/react/code-block";
import { ChatConversation } from "@heroui-pro/react/chat-conversation";
import { ChatMessage } from "@heroui-pro/react/chat-message";
import { KPI } from "@heroui-pro/react/kpi";
import { NativeSelect } from "@heroui-pro/react/native-select";
import { PromptInput } from "@heroui-pro/react/prompt-input";
import { Segment } from "@heroui-pro/react/segment";
import { Sidebar } from "@heroui-pro/react/sidebar";
import { Timeline } from "@heroui-pro/react/timeline";

const vendoredHeroUIProPath = ["vendor", "herouipro-v3"].join("/");

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

    expect(source).toContain('@import "@heroui-pro/react/css";');
  });

  it("wraps Usage Segment controls in a shared element transition scope", () => {
    const source = readFileSync(
      join(process.cwd(), "src/usage.tsx"),
      "utf8",
    );

    expect(source).toContain("SharedElementTransition");
  });

  it("does not depend on vendored HeroUI Pro source paths", () => {
    const files = [
      "vite.config.ts",
      "tsconfig.json",
      "src/session-detail.tsx",
      "src/styles.css",
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toContain(vendoredHeroUIProPath);
    }
  });
});
