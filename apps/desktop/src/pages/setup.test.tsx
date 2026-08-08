import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ConfigInventoryView,
  SetupInventoryControls,
  type ConfigInventory,
} from "@/pages/setup";

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

const incompleteInventory: ConfigInventory = {
  defaultModel: "",
  defaultProvider: undefined,
  defaultThinkingLevel: "",
  theme: undefined,
  packages: [],
  extensions: [],
  skills: [],
  promptTemplates: [],
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
    render(<ConfigInventoryView inventory={inventory} selected="templates" />);

    expect(screen.getByText("Prompt Templates")).toBeInTheDocument();
    expect(screen.getByText("Not installed")).toBeInTheDocument();
  });

  it("uses English labels for missing model defaults", () => {
    render(<ConfigInventoryView inventory={incompleteInventory} selected="models" />);

    expect(screen.getAllByText("Not set")).toHaveLength(4);
  });

  it("renders package names as an Astryx list", () => {
    render(<ConfigInventoryView inventory={inventory} selected="packages" />);

    expect(screen.getByTestId("installed-items-list")).toHaveAttribute("role", "list");
    expect(screen.getByRole("listitem")).toHaveTextContent("@pi/code");
  });

  it("renders extension status in Astryx list item descriptions", () => {
    render(<ConfigInventoryView inventory={inventory} selected="extensions" />);

    expect(screen.getByTestId("installed-extensions-list")).toHaveAttribute("role", "list");
    expect(screen.getByText("terminal-tools")).toBeInTheDocument();
    expect(screen.getByText("enabled · settings")).toBeInTheDocument();
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
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });
});
