import { render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEMES, preloadHighlighter } from "@pierre/diffs";
import SessionDiffViewer from "./session-diff-viewer";

beforeAll(async () => {
  await preloadHighlighter({ themes: [DEFAULT_THEMES.light, DEFAULT_THEMES.dark], langs: ["text"] });
});

const patch = "diff --git a/note.txt b/note.txt\n--- a/note.txt\n+++ b/note.txt\n@@ -1,3 +1,3 @@\n keep\n-old\n+new\n tail\n";

describe("Session diff link navigation", () => {
  it("highlights and scrolls to the new-side line, not the deletion with the same number", async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const { container } = render(<SessionDiffViewer patch={patch} cacheKey="line-navigation" style="unified" line={2} />);
    await waitFor(() => {
      const root = container.querySelector("diffs-container")?.shadowRoot;
      const selected = root?.querySelector('[data-line][data-selected-line]');
      expect(selected).toHaveTextContent("new");
      expect(selected).not.toHaveTextContent("old");
      expect(scroll.mock.instances.some((node) => node instanceof Node && root?.contains(node))).toBe(true);
    });
    scroll.mockRestore();
  });

  it("uses the old side for deleted files and leaves unavailable lines at the file-level jump", async () => {
    const deletedPatch = "diff --git a/note.txt b/note.txt\ndeleted file mode 100644\n--- a/note.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n";
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const view = render(<SessionDiffViewer patch={deletedPatch} cacheKey="deleted-line" style="unified" line={1} />);
    await waitFor(() => expect(view.container.querySelector("diffs-container")?.shadowRoot
      ?.querySelector('[data-line][data-selected-line]')).toHaveTextContent("old"));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    scroll.mockClear();
    view.rerender(<SessionDiffViewer patch={deletedPatch} cacheKey="omitted-line" style="unified" line={1000} />);
    await waitFor(() => {
      const root = view.container.querySelector("diffs-container")?.shadowRoot;
      expect(root?.querySelector("[data-line]")).toHaveTextContent("old");
      expect(root?.querySelector("[data-selected-line]")).toBeNull();
    });
    expect(scroll).not.toHaveBeenCalled();
    scroll.mockRestore();
  });
});
