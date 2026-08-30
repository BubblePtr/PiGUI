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
      "PiTraceLedger",
      "PiTraceStrip",
      "PiTraceInspector",
      "DotMatrix",
      "Icons",
      "ChatMessage",
      "ChatMarkdown",
      "ChatCodeBlock",
      "ChatTool",
      "ChatPromptInput",
      "ChatPromptSuggestion",
      "ChatChainOfThought",
      "ChatThoughtMarkdown",
      "ChatConversation",
      "TextShimmer",
      "ComposerInsertMenu",
      "ComposerAttachmentDrawer",
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

  it("shows the Cockpit ledger: run headers, row states, focus dim, and empty variant", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "PiTraceLedger" });

    expect(within(section).getAllByText(/Run #/).length).toBeGreaterThan(0);
    expect(section.querySelector('[data-slot="trace-ledger-row"][data-status="ok"]')).toBeInTheDocument();
    expect(section.querySelector('[data-slot="trace-ledger-row"][data-status="error"]')).toBeInTheDocument();
    expect(section.querySelector('[data-slot="trace-ledger-row"][data-status="running"]')).toBeInTheDocument();
    expect(section.querySelector('[data-slot="trace-turn-boundary"]')).toBeInTheDocument();
    expect(section.querySelector("[data-focus-dimmed]")).toBeInTheDocument();
    expect(within(section).getByText("No trace entries.")).toBeInTheDocument();
    // Rows never expand inline — result previews render, full payloads don't.
    expect(within(section).getAllByText("3 files changed").length).toBeGreaterThan(0);
  });

  it("shows the Strip swimlanes and the Inspector states", () => {
    render(<DesignComponentsLayer />);

    const strip = screen.getByRole("region", { name: "PiTraceStrip" });
    expect(strip.querySelector('[data-slot="trace-strip"]')).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "Steps" })).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: "Time" })).toBeInTheDocument();
    expect(strip.querySelectorAll("[data-strip-col][data-focus-dimmed]").length).toBeGreaterThan(2);

    const inspector = screen.getByRole("region", { name: "PiTraceInspector" });
    expect(within(inspector).getAllByRole("tab", { name: "Schema" }).length).toBeGreaterThan(0);
    expect(within(inspector).getByText(/Run a shell command/)).toBeInTheDocument();
  });

  it("shows all four ChatTool states", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ChatTool" });

    // Astryx renders status as an icon, so assert the wrapper contract instead.
    for (const state of [
      "input-streaming",
      "input-available",
      "output-available",
      "output-error",
    ]) {
      expect(
        section.querySelector(`[data-slot="chat-tool"][data-state="${state}"]`),
      ).toBeInTheDocument();
    }
  });

  it("shows the chat heading scale against body copy", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ChatMarkdown" });

    expect(within(section).getByText("heading scale")).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { level: 3, name: "First-level heading" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { level: 4, name: "Second-level heading" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { level: 5, name: "Third-level heading" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { level: 6, name: "Fourth-level heading" }),
    ).toBeInTheDocument();
  });

  it("streams the markdown demo chunk by chunk and replays on demand", async () => {
    const user = userEvent.setup();

    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ChatMarkdown" });
    const stream = within(section).getByTestId("stream-markdown-renderer");

    // The demo feeds the fixture in chunks; it starts streaming on mount and
    // settles once the whole fixture (including late blockquote/code content)
    // has arrived.
    expect(stream).toHaveAttribute("data-is-streaming", "true");
    await waitFor(
      () => expect(stream).toHaveAttribute("data-is-streaming", "false"),
      { timeout: 15_000 },
    );
    await waitFor(() => expect(stream).toHaveTextContent("blockquote"), {
      timeout: 5_000,
    });

    await user.click(within(section).getByRole("button", { name: "Replay" }));

    expect(stream).toHaveAttribute("data-is-streaming", "true");
    await waitFor(
      () => expect(stream).toHaveAttribute("data-is-streaming", "false"),
      { timeout: 15_000 },
    );
  }, 40_000);

  it("shows ChatToolGroup single and grouped variants", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ChatToolGroup" });

    const single = section.querySelector('[data-slot="chat-tool-group"][data-tool-count="1"]');
    expect(single).toBeInTheDocument();
    expect(single).toHaveAttribute("data-state", "output-available");
    expect(single).toHaveTextContent("read_file");
    expect(single).toHaveTextContent("src/index.ts");
    expect(single).toHaveTextContent("45ms");

    const grouped = section.querySelector('[data-slot="chat-tool-group"][data-tool-count="4"]');
    expect(grouped).toBeInTheDocument();
    expect(grouped).not.toHaveAttribute("data-state");
    expect(grouped).toHaveTextContent("git diff --stat");
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

  it("registers the composer insert menu and attachment drawer", () => {
    render(<DesignComponentsLayer />);

    expect(
      screen.getByRole("region", { name: "ComposerInsertMenu" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "ComposerInsertMenu" })).getByText(
        "with skills and plugins",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "ComposerAttachmentDrawer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("notes.md")).toBeInTheDocument();
  });

  it("registers the ModelSelectorControl with its variants", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ModelSelectorControl" });

    expect(
      within(section).getByText("locked while a run is active"),
    ).toBeInTheDocument();
    expect(
      within(section).getAllByTestId("model-thinking-trigger").length,
    ).toBeGreaterThanOrEqual(3);
    // Fast-selected variant surfaces the fast sibling name in its trigger.
    expect(within(section).getByText(/Grok 4 Fast · Medium/)).toBeInTheDocument();
  });

  it("shows persist actions on the settled assistant message", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ChatMessage" });

    expect(within(section).getByText("Assistant with persist actions")).toBeInTheDocument();
    expect(section.querySelector(".chat-message__actions--persist")).toBeInTheDocument();
  });

  it("shows streaming and settled CoT variants", () => {
    render(<DesignComponentsLayer />);

    const section = screen.getByRole("region", { name: "ChatChainOfThought" });

    expect(within(section).getByText("streaming, live viewport")).toBeInTheDocument();
    expect(within(section).getByText("collapsed, settled")).toBeInTheDocument();
    expect(within(section).getByText("expanded, settled")).toBeInTheDocument();
    expect(within(section).getByText("Thinking…")).toBeInTheDocument();
    expect(within(section).getByText("2.5s")).toBeInTheDocument();
    expect(section.querySelector('[data-slot="chat-pixel-loader"]')).toBeInTheDocument();

    const markdown = screen.getByRole("region", { name: "ChatThoughtMarkdown" });
    expect(within(markdown).getByText("inline emphasis and code")).toBeInTheDocument();
    expect(within(markdown).getByText("unclosed marker hidden")).toBeInTheDocument();
  });

  it("is wired into the design page", () => {
    const source = readFileSync(
      join(repoRoot, "apps/desktop/src/pages/design.tsx"),
      "utf8",
    );

    expect(source).toContain("<DesignComponentsLayer />");
  });
});
