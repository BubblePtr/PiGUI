import { IconButton } from "@astryxdesign/core/IconButton";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import type { ReactNode } from "react";
import { SidebarLeft } from "@/shared/ui/icons";
import {
  sessionSurfaceOrder,
  sessionSurfaces,
  type SessionSurfaceId,
} from "@/shared/ui/session-dock/surface-registry";

/**
 * Session-scoped surface host: one panel plus an icon rail on its own right
 * edge. The rail belongs to the panel, so closing the dock removes both —
 * nothing stays docked against the window (ADR-0028).
 *
 * The host writes nothing above the surface: the rail names the active surface
 * and its tooltip explains it, so the 40px band at the top of the panel is the
 * surface's own first row (`SessionSurfaceBar`), not a header of ours.
 */

/** Panel geometry (ADR-0028); the drag itself is Astryx `useResizable`. */
export const sessionDockDefaultWidthPx = 560;
const minWidthPx = 340;
/**
 * What Chat keeps for itself. The panel may take everything else — a fixed
 * fraction of the viewport used to cap it, which left the Browser surface too
 * narrow on wide windows (ADR-0028, 2026-09-02 revision).
 */
export const sessionDockChatMinWidthPx = 400;

/**
 * @param availableWidth Width Chat and the panel actually share, i.e. the
 * split container minus whatever sits between them (the resize handle's
 * gutter). The caller owns that subtraction because it owns the handle.
 */
export function sessionDockResizableBounds(availableWidth: number) {
  return {
    minSizePx: minWidthPx,
    // Floor, not round: this ceiling exists to protect Chat's minimum, and a
    // fractional container width must not round the panel a pixel over it.
    // A window too narrow for both minimums must not produce an inverted range.
    maxSizePx: Math.max(
      minWidthPx,
      Math.floor(availableWidth - sessionDockChatMinWidthPx),
    ),
  };
}

/**
 * Toolbar affordance for the whole dock. It is the only way back once the
 * panel (and with it the rail) is closed, so it lives with the component.
 */
export function SessionDockTrigger({
  alignToRail = false,
  isOpen,
  onOpenChange,
}: {
  /**
   * Docked layouts: seat the toggle on the rail's axis so it reads as the
   * head of the rail column. The slot is rail-width (`w-11`) and cancels the
   * header chrome's 1rem right inset; it stays put whether the panel is open
   * or closed so the toggle never jumps.
   */
  alignToRail?: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  // A plain ghost button, not a ToggleButton: the panel being open is already
  // obvious, and a pressed fill here would compete with the rail's active
  // surface, which is the selection that matters. aria-pressed keeps the
  // state for assistive tech.
  const toggle = (
    <IconButton
      aria-pressed={isOpen}
      icon={<SidebarLeft className="size-4 rotate-180" />}
      label="Session dock"
      size="sm"
      tooltip={isOpen ? "Hide dock" : "Show dock"}
      variant="ghost"
      onClick={() => onOpenChange(!isOpen)}
    />
  );

  if (!alignToRail) {
    return toggle;
  }

  return (
    <span
      className="-mr-4 flex w-11 shrink-0 justify-center"
      data-testid="session-dock-trigger-rail-slot"
    >
      {toggle}
    </span>
  );
}

export function SessionDock({
  activeSurfaceId,
  badges,
  children,
  onActiveSurfaceChange,
}: {
  activeSurfaceId: SessionSurfaceId;
  /** Live counts per surface, e.g. changed file count. */
  badges?: Partial<Record<SessionSurfaceId, string>>;
  children: ReactNode;
  onActiveSurfaceChange: (surfaceId: SessionSurfaceId) => void;
}) {
  const surface = sessionSurfaces[activeSurfaceId];

  return (
    <aside
      aria-label={surface.title}
      className="flex h-full min-h-0 min-w-0 bg-surface"
      data-testid="session-dock"
    >
      {/* Flush surfaces (registry flushContent) own every inset themselves, so
          their first row and content run edge-to-edge to the rail. */}
      <div
        className={
          surface.flushContent
            ? "min-h-0 min-w-0 flex-1 overflow-y-auto"
            : "min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pt-3 pb-4"
        }
      >
        {children}
      </div>
      <nav className="flex w-11 shrink-0 flex-col items-center border-l border-separator bg-surface">
        {/* The toolbar toggle (header chrome) floats over this cell, so the
            rail reads as toggle / hairline / surfaces. */}
        <div aria-hidden="true" className="h-10 w-full shrink-0" />
        <div className="flex flex-col items-center py-2">
        <ToggleButtonGroup
          label="Session surfaces"
          orientation="vertical"
          type="single"
          value={activeSurfaceId}
          onChange={(value) => {
            // Astryx reports null when the pressed button is clicked again;
            // the dock always shows exactly one surface.
            if (value !== null) {
              onActiveSurfaceChange(value as SessionSurfaceId);
            }
          }}
        >
          {sessionSurfaceOrder.map((surfaceId) => {
            const meta = sessionSurfaces[surfaceId];
            const RailIcon = meta.icon;
            const badge = badges?.[surfaceId];

            return (
              <ToggleButton
                key={surfaceId}
                icon={
                  <span className="relative flex items-center justify-center">
                    <RailIcon className="size-4" />
                    {badge ? (
                      <span className="absolute -top-1.5 -right-2 rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-background tabular-nums">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                }
                isIconOnly
                label={meta.title}
                // Same size as the toolbar toggle so the column reads as one.
                size="sm"
                tooltip={`${meta.title} — ${meta.hint}`}
                value={surfaceId}
              />
            );
          })}
        </ToggleButtonGroup>
        </div>
      </nav>
    </aside>
  );
}
