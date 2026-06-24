import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfigInventoryView, type ConfigInventory } from "./setup";

const inventory: ConfigInventory = {
  defaultModel: "gpt-5-codex",
  defaultProvider: "openai",
  defaultThinkingLevel: "high",
  theme: "system",
  packages: ["@pi/code"],
  extensions: [{ name: "terminal-tools", source: "settings", enabled: true }],
  skills: [{ name: "review", source: "directory" }],
  promptTemplates: [],
};

describe("ConfigInventoryView", () => {
  it("renders model defaults", () => {
    const { container } = render(<ConfigInventoryView inventory={inventory} selected="models" />);

    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("system")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
  });

  it("shows not installed for empty prompt templates", () => {
    render(<ConfigInventoryView inventory={inventory} selected="templates" />);

    expect(screen.getByText("Prompt Templates")).toBeInTheDocument();
    expect(screen.getByText("未安装")).toBeInTheDocument();
  });
});
