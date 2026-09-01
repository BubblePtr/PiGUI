import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  SessionInspector,
  sessionInspectorResizableBounds,
} from "@/shared/ui/session-inspector/session-inspector";
import {
  sessionSurfaceOrder,
  sessionSurfaces,
  type SessionSurfaceId,
} from "@/shared/ui/session-inspector/surface-registry";

function renderInspector({
  activeSurfaceId = "changes" as SessionSurfaceId,
  badges,
  onActiveSurfaceChange = vi.fn(),
  onClose = vi.fn(),
}: {
  activeSurfaceId?: SessionSurfaceId;
  badges?: Partial<Record<SessionSurfaceId, string>>;
  onActiveSurfaceChange?: (surfaceId: SessionSurfaceId) => void;
  onClose?: () => void;
} = {}) {
  render(
    <SessionInspector
      activeSurfaceId={activeSurfaceId}
      badges={badges}
      onActiveSurfaceChange={onActiveSurfaceChange}
      onClose={onClose}
    >
      <p>{`${sessionSurfaces[activeSurfaceId].title} surface content`}</p>
    </SessionInspector>,
  );

  return { onActiveSurfaceChange, onClose };
}

describe("SessionInspector", () => {
  it("names the panel after the active surface and renders its content", () => {
    renderInspector({ activeSurfaceId: "actions" });

    const inspector = screen.getByRole("complementary", { name: "Actions" });

    expect(within(inspector).getByText("Actions surface content")).toBeInTheDocument();
  });

  it("puts every registered surface on the rail", () => {
    renderInspector();

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
    const { onActiveSurfaceChange } = renderInspector();

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(onActiveSurfaceChange).toHaveBeenCalledWith("actions");
  });

  // Astryx single-select ToggleButtonGroup reports null when the pressed button
  // is clicked again; the rail must never end up without an active surface.
  it("keeps the active surface when its own rail icon is clicked again", async () => {
    const user = userEvent.setup();
    const { onActiveSurfaceChange } = renderInspector();

    await user.click(
      within(screen.getByRole("group", { name: "Session surfaces" })).getByRole(
        "button",
        { name: "Changes" },
      ),
    );

    expect(onActiveSurfaceChange).not.toHaveBeenCalled();
  });

  it("closes from the panel header", async () => {
    const user = userEvent.setup();
    const { onClose } = renderInspector();

    await user.click(screen.getByRole("button", { name: "Close Session inspector" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a rail badge only for surfaces that report one", () => {
    renderInspector({ badges: { changes: "3" } });

    const rail = screen.getByRole("group", { name: "Session surfaces" });

    expect(within(rail).getByText("3")).toBeInTheDocument();
  });

  it("bounds the panel width at 340px and 58% of the viewport", () => {
    expect(sessionInspectorResizableBounds(1440)).toEqual({
      minSizePx: 340,
      maxSizePx: 835,
    });
    // A window narrower than twice the minimum still needs max >= min, or
    // useResizable would clamp against an inverted range.
    expect(sessionInspectorResizableBounds(500)).toEqual({
      minSizePx: 340,
      maxSizePx: 340,
    });
  });
});
