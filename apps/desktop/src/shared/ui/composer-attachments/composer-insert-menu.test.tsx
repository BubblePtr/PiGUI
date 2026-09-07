import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ComposerInsertMenu } from "./composer-insert-menu";

describe("ComposerInsertMenu", () => {
  it("keeps the first menu short even with many installed skills", async () => {
    const onAttach = vi.fn();
    const user = userEvent.setup();
    render(<ComposerInsertMenu skills={Array.from({ length: 80 }, (_, i) => ({ name: `skill-${i}` }))}
      plugins={[{ name: "browser" }]} onAttach={onAttach} onInsert={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Add to prompt" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    await user.click(screen.getByRole("menuitem", { name: "Add files" }));
    expect(onAttach).toHaveBeenCalledOnce();
  });

  it("searches skill descriptions, handles empty results, and inserts with the keyboard", async () => {
    const onInsert = vi.fn();
    const user = userEvent.setup();
    render(<ComposerInsertMenu skills={[
      { name: "review-pr", description: "Check a pull request for bugs" },
      { name: "write-docs", description: "Write project documentation" },
    ]} onAttach={() => {}} onInsert={onInsert} />);
    await user.click(screen.getByRole("button", { name: "Add to prompt" }));
    await user.click(screen.getByRole("menuitem", { name: "Use skill" }));
    const search = await screen.findByRole("combobox", { name: "Search skills" });
    await waitFor(() => expect(search).toHaveFocus());
    await user.type(search, "no-such-skill");
    expect(await screen.findByText("No matching skills")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "pull request");
    expect(await screen.findByText("review-pr")).toBeInTheDocument();
    expect(screen.queryByText("write-docs")).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onInsert).toHaveBeenCalledWith("/review-pr ");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Use skill" })).not.toBeInTheDocument());
  });

  it("shows a readable plugin name while preserving the insertion identifier", async () => {
    const onInsert = vi.fn();
    const user = userEvent.setup();
    render(<ComposerInsertMenu plugins={[{ name: "../../.pi/extensions/browser-tools/index.ts" }]}
      onAttach={() => {}} onInsert={onInsert} />);
    await user.click(screen.getByRole("button", { name: "Add to prompt" }));
    await user.click(screen.getByRole("menuitem", { name: "Use plugin" }));
    await user.click(await screen.findByRole("option", { name: /Browser tools/ }));
    expect(onInsert).toHaveBeenCalledWith("@../../.pi/extensions/browser-tools/index.ts ");
  });

  it("opens chat commands and inserts the selected command", async () => {
    const onInsert = vi.fn();
    const user = userEvent.setup();
    render(<ComposerInsertMenu onAttach={() => {}} onInsert={onInsert} />);
    await user.click(screen.getByRole("button", { name: "Add to prompt" }));
    await user.click(screen.getByRole("menuitem", { name: /Chat commands/ }));
    await user.click(await screen.findByRole("menuitem", { name: /\/compact/ }));
    expect(onInsert).toHaveBeenCalledWith("/compact ");
  });
});
