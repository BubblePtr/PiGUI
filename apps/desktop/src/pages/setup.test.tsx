import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ConfigInventoryView,
  SetupInventoryControls,
  type ConfigInventory,
} from "@/pages/setup";

const resources: ConfigInventory["extensions"] = [
  { kind: "extension", name: "terminal-tools", path: "/kit/tool.ts", enabled: true, origin: "package", scope: "user", packageSource: "@pi/code" },
  { kind: "skill", name: "review", path: "/kit/SKILL.md", enabled: false, origin: "package", scope: "user", packageSource: "@pi/code" },
  { kind: "prompt", name: "plan", path: "/kit/plan.md", enabled: true, origin: "package", scope: "user", packageSource: "@pi/code" },
  { kind: "theme", name: "night", path: "/kit/night.json", enabled: true, origin: "package", scope: "user", packageSource: "@pi/code" },
];
const inventory: ConfigInventory = {
  defaultModel: "gpt-5-codex",
  defaultProvider: "openai",
  defaultThinkingLevel: "high",
  theme: "system",
  packages: [{ source: "@pi/code", scope: "user", filtered: true, installedPath: "/kit", resources }],
  extensions: [resources[0], { kind: "extension", name: "drop", path: "/extensions/drop.ts", origin: "drop-in", scope: "user", enabled: true }, { kind: "extension", name: "explicit", path: "/custom/tool.ts", origin: "top-level", scope: "user", enabled: false }],
  skills: [resources[1]],
  promptTemplates: [resources[2]],
  themes: [resources[3]],
};

const incompleteInventory: ConfigInventory = {
  defaultModel: "",
  defaultProvider: undefined,
  defaultThinkingLevel: "",
  theme: undefined,
  packages: [],
  extensions: [],
  skills: [],
  promptTemplates: [],
  themes: [],
};

describe("ConfigInventoryView", () => {
  it("renders model defaults", () => {
    const { container } = render(<ConfigInventoryView inventory={inventory} selected="models" />);

    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("system")).toBeInTheDocument();
    expect(container.querySelector(".astryx-card")).toBeInTheDocument();
  });

  it("shows not installed for empty prompt templates", () => {
    render(<ConfigInventoryView inventory={incompleteInventory} selected="templates" />);

    expect(screen.getByText("Prompt Templates")).toBeInTheDocument();
    expect(screen.getByText("Not installed")).toBeInTheDocument();
  });

  it("uses English labels for missing model defaults", () => {
    render(<ConfigInventoryView inventory={incompleteInventory} selected="models" />);

    expect(screen.getAllByText("Not set")).toHaveLength(4);
  });

  it("groups every package resource by kind and exposes disabled resources without controls", () => {
    render(<ConfigInventoryView inventory={inventory} selected="packages" />);
    expect(screen.getByText("@pi/code")).toBeInTheDocument();
    for (const label of ["Extensions", "Skills", "Prompt Templates", "Themes", "terminal-tools", "review", "plan", "night"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(/disabled/)).toBeInTheDocument();
    expect(screen.getByText(/仅影响 Pi 终端/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows origin and package ownership in resource views", () => {
    render(<ConfigInventoryView inventory={inventory} selected="extensions" />);
    expect(screen.getByText(/package · @pi\/code/)).toBeInTheDocument();
    expect(screen.getByText(/drop-in · 由约定目录自动加载/)).toBeInTheDocument();
    expect(screen.getByText(/disabled · user · top-level/)).toBeInTheDocument();
  });

  it("explains the terminal-only scope in the themes view", () => {
    render(<ConfigInventoryView inventory={inventory} selected="themes" />);
    expect(screen.getByText("night")).toBeInTheDocument();
    expect(screen.getByText(/仅影响 Pi 终端/)).toBeInTheDocument();
  });
});

describe("SetupInventoryControls", () => {
  it("renders setup categories with Astryx SegmentedControl", () => {
    const { container } = render(
      <SetupInventoryControls
        selected="models"
        onSelect={() => {}}
        inventory={inventory}
        isFetching={false}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Configuration sections" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Models/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Packages/ })).toBeInTheDocument();
    expect(container.querySelector(".astryx-segmented-control")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(6);
  });
});
