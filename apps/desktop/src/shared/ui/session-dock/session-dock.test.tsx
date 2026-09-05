import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  SessionDock,
  sessionDockChatMinWidthPx,
  sessionDockExitMs,
  sessionDockResizableBounds,
  useSessionDockPresence,
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

    expect(dock).toHaveAttribute("data-open", "true");
    expect(within(dock).getByText("Terminal surface content")).toBeInTheDocument();
  });

  // ADR-0028 (2026-09-05): the rail names the surface and its tooltip explains
  // it, so a header would say the same thing a third time — and push every
  // surface's own first row into a second band.
  it("writes no title or hint of its own above the surface", () => {
    renderDock({ activeSurfaceId: "terminal" });

    const dock = screen.getByRole("complementary", { name: "Terminal" });

    expect(within(dock).queryByRole("heading")).not.toBeInTheDocument();
    expect(
      within(dock).queryByText(sessionSurfaces.terminal.hint),
    ).not.toBeInTheDocument();
    // The content column starts at the top of the panel: no band of ours
    // between it and the titlebar.
    expect(dock.firstElementChild).toHaveTextContent("Terminal surface content");
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

  it("marks a closed dock as hidden and inert", () => {
    render(
      <SessionDock
        activeSurfaceId="changes"
        open={false}
        onActiveSurfaceChange={vi.fn()}
      >
        <p>Changes surface content</p>
      </SessionDock>,
    );

    const dock = screen.getByTestId("session-dock");

    expect(dock).toHaveAttribute("data-open", "false");
    expect(dock).toHaveAttribute("aria-hidden", "true");
    expect(dock).toHaveAttribute("inert");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Changes" }),
    ).not.toBeInTheDocument();
  });

  it("stays mounted through the exit, then unmounts", async () => {
    function Probe({ open }: { open: boolean }) {
      const mounted = useSessionDockPresence(open);

      return mounted ? <div data-testid="dock-presence">mounted</div> : null;
    }

    const { rerender } = render(<Probe open />);

    expect(screen.getByTestId("dock-presence")).toBeInTheDocument();

    rerender(<Probe open={false} />);

    expect(screen.getByTestId("dock-presence")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("dock-presence")).not.toBeInTheDocument();
    });
    expect(sessionDockExitMs).toBe(180);
  });

  it("unmounts immediately when reduced motion is preferred", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn((query: string): MediaQueryList => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })),
    });

    function Probe({ open }: { open: boolean }) {
      const mounted = useSessionDockPresence(open);

      return mounted ? <div data-testid="dock-presence">mounted</div> : null;
    }

    try {
      const { rerender } = render(<Probe open />);
      rerender(<Probe open={false} />);

      await waitFor(() => {
        expect(screen.queryByTestId("dock-presence")).not.toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("fades surface content on pointer switches, not keyboard ones", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [activeSurfaceId, setActiveSurfaceId] =
        useState<SessionSurfaceId>("changes");

      return (
        <SessionDock
          activeSurfaceId={activeSurfaceId}
          onActiveSurfaceChange={setActiveSurfaceId}
        >
          <p>{`${sessionSurfaces[activeSurfaceId].title} surface content`}</p>
        </SessionDock>
      );
    }

    render(<Harness />);

    expect(screen.getByTestId("session-dock-surface")).not.toHaveAttribute(
      "data-motion",
    );

    await user.click(screen.getByRole("button", { name: "Terminal" }));

    expect(screen.getByTestId("session-dock-surface")).toHaveAttribute(
      "data-motion",
      "enter",
    );
    expect(screen.getByText("Terminal surface content")).toBeInTheDocument();

    screen.getByRole("button", { name: "Browser" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByText("Browser surface content")).toBeInTheDocument();
    expect(screen.getByTestId("session-dock-surface")).not.toHaveAttribute(
      "data-motion",
    );
  });

  it("animates open/close on transform and opacity, never width, and disables under reduced motion", () => {
    const styles = readFileSync(
      join(process.cwd(), "apps/desktop/src/app/styles.css"),
      "utf8",
    );

    expect(styles).toContain(".pigui-session-dock {");
    expect(styles).toContain(".pigui-session-dock[data-open=\"false\"]");
    expect(styles).toContain("transform: translateX(100%)");
    expect(styles).toContain("opacity 250ms cubic-bezier(0.32, 0.72, 0, 1)");
    expect(styles).toContain("transition-duration: 180ms");
    expect(styles).toContain(".pigui-session-dock-surface[data-motion=\"enter\"]");
    expect(styles).toContain("translateY(2px)");
    expect(styles).toContain(".pigui-session-dock-rail button");
    expect(styles).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*\.pigui-session-dock,/,
    );
    expect(styles).not.toMatch(
      /\.pigui-session-dock[^{]*\{[^}]*\bwidth\b[^}]*transition/,
    );
  });
});
