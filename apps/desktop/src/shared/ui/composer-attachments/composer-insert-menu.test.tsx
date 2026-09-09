import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { invoke } from "@/shared/runtime";
import { useComposerInsertCatalog } from "./use-composer-attachments";
import { ComposerInsertMenu } from "./composer-insert-menu";

vi.mock("@/shared/runtime", () => ({ invoke: vi.fn() }));

describe("ComposerInsertMenu", () => {
  it("omits disabled skills from the insertion catalog", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      skills: [{ name: "enabled", enabled: true }, { name: "disabled", enabled: false }],
      extensions: [],
    });
    const client = new QueryClient();
    const { result } = renderHook(() => useComposerInsertCatalog(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await waitFor(() => expect(result.current.skills).toEqual([{ name: "enabled", enabled: true }]));
    vi.mocked(invoke).mockResolvedValueOnce({ skills: [{ name: "enabled", enabled: false }], extensions: [] });
    await client.invalidateQueries({ queryKey: ["config-inventory"] });
    await waitFor(() => expect(result.current.skills).toEqual([]));
  });

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
