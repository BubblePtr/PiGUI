import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Terminal } from "@/shared/ui/icons";
import {
  SessionSurfaceBar,
  SessionSurfaceTabs,
  type SessionSurfaceTabItem,
} from "@/shared/ui/session-dock/surface-bar";

function renderTabs({
  activeId = "a",
  items = [
    { id: "a", label: "Terminal 1" },
    { id: "b", label: "Terminal 2" },
  ] as SessionSurfaceTabItem[],
}: {
  activeId?: string | null;
  items?: SessionSurfaceTabItem[];
} = {}) {
  const handlers = {
    onActivate: vi.fn(),
    onAdd: vi.fn(),
    onClose: vi.fn(),
  };

  render(
    <SessionSurfaceBar>
      <SessionSurfaceTabs
        activeId={activeId}
        addLabel="New terminal"
        icon={Terminal}
        items={items}
        label="Terminal instances"
        {...handlers}
      />
    </SessionSurfaceBar>,
  );

  return {
    ...handlers,
    strip: screen.getByRole("tablist", { name: "Terminal instances" }),
  };
}

describe("SessionSurfaceBar", () => {
  it("keeps the surface's first row on Chat's 40px title baseline", () => {
    render(
      <SessionSurfaceBar actions={<button type="button">Refresh</button>}>
        <p>3 files</p>
      </SessionSurfaceBar>,
    );

    const bar = screen.getByTestId("session-surface-bar");

    // ADR-0028: the band is exactly one 40px row so the dock's first line and
    // Chat's title sit on the same baseline.
    expect(bar).toHaveClass("h-10");
    expect(within(bar).getByText("3 files")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });

  it("renders a status-only bar when the surface has no actions yet", () => {
    render(
      <SessionSurfaceBar>
        <p>Working tree clean</p>
      </SessionSurfaceBar>,
    );

    const bar = screen.getByTestId("session-surface-bar");

    expect(within(bar).getByText("Working tree clean")).toBeInTheDocument();
    expect(within(bar).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("SessionSurfaceTabs", () => {
  it("marks the active instance and switches to another", async () => {
    const user = userEvent.setup();
    const { onActivate, strip } = renderTabs();

    expect(within(strip).getByRole("tab", { name: "Terminal 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(strip).getByRole("tab", { name: "Terminal 2" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    await user.click(within(strip).getByRole("tab", { name: "Terminal 2" }));

    expect(onActivate).toHaveBeenCalledWith("b");
  });

  it("closes one instance from its own tab", async () => {
    const user = userEvent.setup();
    const { onClose, strip } = renderTabs();

    await user.click(within(strip).getByRole("button", { name: "Close Terminal 2" }));

    expect(onClose).toHaveBeenCalledWith("b");
  });

  it("opens a new instance from the trailing button", async () => {
    const user = userEvent.setup();
    const { onAdd, strip } = renderTabs();

    await user.click(within(strip).getByRole("button", { name: "New terminal" }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("mutes an instance whose process is gone without hiding its tab", () => {
    const { strip } = renderTabs({
      items: [
        { id: "a", label: "Terminal 1", isExited: true },
        { id: "b", label: "Terminal 2" },
      ],
    });

    // The tab stays selectable: its scrollback is still worth reading.
    expect(
      within(strip).getByRole("tab", {
        name: (name) => name.includes("Terminal 1") && name.includes("(exited)"),
      }),
    ).toBeEnabled();
    expect(within(strip).getByText("(exited)")).toHaveClass("text-muted");
  });

  it("renders a single instance with the same controls as a full strip", () => {
    const { strip } = renderTabs({
      items: [{ id: "a", label: "Terminal 1" }],
    });

    expect(within(strip).getAllByRole("tab")).toHaveLength(1);
    expect(
      within(strip).getByRole("button", { name: "Close Terminal 1" }),
    ).toBeInTheDocument();
    expect(
      within(strip).getByRole("button", { name: "New terminal" }),
    ).toBeInTheDocument();
  });
});
