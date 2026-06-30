import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Dropdown } from "@heroui/react";
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

function sourceFilesUnder(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const childPath = join(path, entry);
    const childStat = statSync(childPath);

    if (childStat.isDirectory()) {
      return sourceFilesUnder(childPath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [childPath] : [];
  });
}

describe("HeroUI Pro integration", () => {
  it("exposes the compound components planned for the Pig UI shell", () => {
    expect(AppLayout.Root).toBeTypeOf("function");
    expect(Sidebar.MenuItem).toBeTypeOf("function");
    expect(Sidebar.MenuAction).toBeTypeOf("function");
    expect(Sidebar.MenuTrigger).toBeTypeOf("function");
    expect(Sidebar.Submenu).toBeTypeOf("function");
    expect(Segment.Item).toBeTypeOf("function");
    expect(Dropdown.Menu).toBeTypeOf("function");
    expect(Dropdown.Item).toBeTypeOf("function");
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
      join(process.cwd(), "apps/desktop/src/app/styles.css"),
      "utf8",
    );

    expect(source).toContain('@import "@heroui-pro/react/css";');
  });

  it("documents the HeroUI Sidebar slot vocabulary in Chinese", () => {
    const source = readFileSync(
      join(process.cwd(), "docs/heroui-sidebar-slots.md"),
      "utf8",
    );

    expect(source).toContain("# HeroUI Sidebar Slot 速查");
    expect(source).toContain("| `Sidebar.MenuAction` | 菜单动作按钮 |");
    expect(source).toContain("| `Sidebar.MenuTrigger` | 子菜单展开按钮 |");
    expect(source).toContain("| `Sidebar.Submenu` | 子菜单容器 |");
    expect(source).toContain("Project header 是父级 `Sidebar.MenuItem`");
    expect(source).toContain("PiGUI 约定");
  });

  it("wraps Usage Segment controls in a shared element transition scope", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/desktop/src/pages/usage.tsx"),
      "utf8",
    );

    expect(source).toContain("SharedElementTransition");
  });

  it("uses Hugeicons as the renderer icon source", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const sourceFiles = sourceFilesUnder(join(process.cwd(), "apps/desktop/src"));
    const previousIconPackage = ["lucide", "react"].join("-");
    const filesWithLucide = sourceFiles.filter((file) =>
      readFileSync(file, "utf8").includes(previousIconPackage),
    );

    expect(filesWithLucide).toEqual([]);
    expect(packageJson).toContain('"@hugeicons/react"');
    expect(packageJson).toContain('"@hugeicons/core-free-icons"');
    expect(packageJson).not.toContain(previousIconPackage);
  });

  it("renders Hugeicons with the PiGUI stroke weight", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/desktop/src/shared/ui/icons.tsx"),
      "utf8",
    );

    expect(source).toContain("const piguiIconStrokeWidth = 1.5;");
    expect(source).toContain("strokeWidth={piguiIconStrokeWidth}");
    expect(source).not.toContain("strokeWidth={2}");
  });

  it("does not depend on vendored HeroUI Pro source paths", () => {
    const files = [
      "vite.config.ts",
      "tsconfig.json",
      "apps/desktop/src/pages/session-detail.tsx",
      "apps/desktop/src/app/styles.css",
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toContain(vendoredHeroUIProPath);
    }
  });
});
