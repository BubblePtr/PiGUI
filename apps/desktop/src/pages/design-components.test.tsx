import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DesignComponentsLayer } from "@/pages/design-components";

const repoRoot = process.cwd();

describe("Design components layer", () => {
  it("registers a region for every shared/ui component", () => {
    render(<DesignComponentsLayer />);

    for (const name of [
      "PiKpi",
      "PiBarChart",
      "PiSheet",
      "DotMatrix",
      "Icons",
      "ChatMessage",
      "ChatMarkdown",
      "ChatCodeBlock",
      "ChatTool",
      "ChatPromptInput",
      "ChatPromptSuggestion",
      "ChatChainOfThought",
      "ChatConversation",
      "TextShimmer",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("shows PiKpi in stacked, inline, delta and empty variants", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "PiKpi" });

    expect(within(section).getByText("layout=stacked")).toBeInTheDocument();
    expect(within(section).getByText("layout=inline")).toBeInTheDocument();
    expect(within(section).getByText("with delta")).toBeInTheDocument();
    expect(within(section).getByText("no value")).toBeInTheDocument();
  });

  it("shows all four ChatTool states", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ChatTool" });

    // input-streaming and input-available both label as Running.
    expect(within(section).getAllByText("Running")).toHaveLength(2);
    expect(within(section).getByText("Done")).toBeInTheDocument();
    expect(within(section).getByText("Failed")).toBeInTheDocument();
  });

  it("shows the prompt input across its status matrix", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ChatPromptInput" });

    for (const caption of [
      "status=ready (empty)",
      "status=ready (with text)",
      "status=streaming",
      "status=error",
    ]) {
      expect(within(section).getByText(caption)).toBeInTheDocument();
    }
  });

  it("renders the full icon set with export names as labels", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "Icons" });

    for (const iconName of ["Activity", "Palette", "Wrench", "BotMessage"]) {
      expect(within(section).getByText(iconName)).toBeInTheDocument();
    }
  });

  it("opens and closes the PiSheet demo from its trigger", async () => {
    const user = userEvent.setup();

    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "PiSheet" });

    await user.click(within(section).getByRole("button", { name: "Open sheet" }));

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Sheet demo")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Close" }));

    // The sheet leaves through an exit transition; teardown may land before
    // or after this line depending on test load, so poll.
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("is wired into the design page", () => {
    const source = readFileSync(
      join(repoRoot, "apps/desktop/src/pages/design.tsx"),
      "utf8",
    );

    expect(source).toContain("<DesignComponentsLayer />");
  });
});
