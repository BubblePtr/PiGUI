import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  SessionDock,
  sessionDockChatMinWidthPx,
  sessionDockResizableBounds,
} from "@/shared/ui/session-dock/session-dock";
import {
  sessionSurfaceOrder,
  sessionSurfaces,
  type SessionSurfaceId,
} from "@/shared/ui/session-dock/surface-registry";

function renderDock({
  activeSurfaceId = "changes" as SessionSurfaceId,
  badges,
  onActiveSurfaceChange = vi.fn(),
}: {
  activeSurfaceId?: SessionSurfaceId;
  badges?: Partial<Record<SessionSurfaceId, string>>;
  onActiveSurfaceChange?: (surfaceId: SessionSurfaceId) => void;
} = {}) {
  render(
    <SessionDock
      activeSurfaceId={activeSurfaceId}
      badges={badges}
      onActiveSurfaceChange={onActiveSurfaceChange}
    >
      <p>{`${sessionSurfaces[activeSurfaceId].title} surface content`}</p>
    </SessionDock>,
  );

  return { onActiveSurfaceChange };
}

describe("SessionDock", () => {
  it("names the panel after the active surface and renders its content", () => {
    renderDock({ activeSurfaceId: "terminal" });

    const dock = screen.getByRole("complementary", { name: "Terminal" });

    expect(within(dock).getByText("Terminal surface content")).toBeInTheDocument();
  });

  it("puts every registered surface on the rail", () => {
    renderDock();

    const rail = screen.getByRole("group", { name: "Session surfaces" });

    for (const surfaceId of sessionSurfaceOrder) {
      expect(
        within(rail).getByRole("button", { name: sessionSurfaces[surfaceId].title }),
      ).toBeInTheDocument();
    }
    expect(
      within(rail).getByRole("button", { name: "Changes" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("switches the active surface from the rail", async () => {
    const user = userEvent.setup();
    const { onActiveSurfaceChange } = renderDock();

    await user.click(screen.getByRole("button", { name: "Terminal" }));

    expect(onActiveSurfaceChange).toHaveBeenCalledWith("terminal");
  });

  // Astryx single-select ToggleButtonGroup reports null when the pressed button
  // is clicked again; the rail must never end up without an active surface.
  it("keeps the active surface when its own rail icon is clicked again", async () => {
    const user = userEvent.setup();
    const { onActiveSurfaceChange } = renderDock();

    await user.click(
      within(screen.getByRole("group", { name: "Session surfaces" })).getByRole(
        "button",
        { name: "Changes" },
      ),
    );

    expect(onActiveSurfaceChange).not.toHaveBeenCalled();
  });

  it("has no close button of its own: the toolbar toggle owns open/close", () => {
    renderDock();

    expect(
      screen.queryByRole("button", { name: "Close Session dock" }),
    ).not.toBeInTheDocument();
  });

  it("shows a rail badge only for surfaces that report one", () => {
    renderDock({ badges: { changes: "3" } });

    const rail = screen.getByRole("group", { name: "Session surfaces" });

    expect(within(rail).getByText("3")).toBeInTheDocument();
  });

  it("lets the panel take everything Chat's minimum width does not need", () => {
    // Chat keeps 400px; the panel may have the rest, so a wide window can give
    // the Browser surface far more than the old 58% ceiling allowed.
    expect(sessionDockResizableBounds(1440)).toEqual({
      minSizePx: 340,
      maxSizePx: 1040,
    });
    expect(sessionDockResizableBounds(sessionDockChatMinWidthPx + 340)).toEqual({
      minSizePx: 340,
      maxSizePx: 340,
    });
    // Narrower than both minimums together still needs max >= min, or
    // useResizable would clamp against an inverted range.
    expect(sessionDockResizableBounds(500)).toEqual({
      minSizePx: 340,
      maxSizePx: 340,
    });
  });
});
