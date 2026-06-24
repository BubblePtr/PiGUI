import { describe, expect, it } from "vitest";
import {
  AppLayout,
  CodeBlock,
  KPI,
  NativeSelect,
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
  });
});
