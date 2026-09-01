import { IconButton } from "@astryxdesign/core/IconButton";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import type { ReactNode } from "react";
import { Cancel, SidebarLeft } from "@/shared/ui/icons";
import {
  sessionSurfaceOrder,
  sessionSurfaces,
  type SessionSurfaceId,
} from "@/shared/ui/session-inspector/surface-registry";

/**
 * Session-scoped surface host: one panel plus an icon rail on its own right
 * edge. The rail belongs to the panel, so closing the inspector removes both —
 * nothing stays docked against the window (ADR-0028).
 */

const headingId = "session-inspector-heading";

/** Panel geometry (ADR-0028); the drag itself is Astryx `useResizable`. */
export const sessionInspectorDefaultWidthPx = 560;
const minWidthPx = 340;
const maxWidthViewportRatio = 0.58;

export function sessionInspectorResizableBounds(viewportWidth: number) {
  return {
    minSizePx: minWidthPx,
    // Chat keeps the rest of the viewport; a narrow window must not produce an
    // inverted range.
    maxSizePx: Math.max(
      minWidthPx,
      Math.round(viewportWidth * maxWidthViewportRatio),
    ),
  };
}

/**
 * Toolbar affordance for the whole inspector. It is the only way back once the
 * panel (and with it the rail) is closed, so it lives with the component.
 */
export function SessionInspectorTrigger({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <ToggleButton
      icon={<SidebarLeft className="size-4 rotate-180" />}
      isIconOnly
      isPressed={isOpen}
      label="Session inspector"
      size="sm"
      tooltip={isOpen ? "Hide inspector" : "Show inspector"}
      onPressedChange={onOpenChange}
    />
  );
}

export function SessionInspector({
  activeSurfaceId,
  badges,
  children,
  onActiveSurfaceChange,
  onClose,
}: {
  activeSurfaceId: SessionSurfaceId;
  /** Live counts per surface, e.g. changed file count. */
  badges?: Partial<Record<SessionSurfaceId, string>>;
  children: ReactNode;
  onActiveSurfaceChange: (surfaceId: SessionSurfaceId) => void;
  onClose: () => void;
}) {
  const surface = sessionSurfaces[activeSurfaceId];
  const SurfaceIcon = surface.icon;

  return (
    <aside
      aria-labelledby={headingId}
      className="flex h-full min-h-0 min-w-0 bg-background"
      data-testid="session-inspector"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-10 shrink-0 items-center gap-2 px-4">
          <h2
            className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold text-foreground"
            id={headingId}
          >
            <SurfaceIcon className="size-4 shrink-0 text-muted" />
            <span className="truncate">{surface.title}</span>
          </h2>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {surface.hint}
          </span>
          <IconButton
            icon={<Cancel className="size-4" />}
            label="Close Session inspector"
            size="sm"
            tooltip="Close inspector"
            variant="ghost"
            onClick={onClose}
          />
        </header>
        <div className="pigui-scroll-fade min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </div>
      <nav className="flex w-11 shrink-0 flex-col items-center border-l border-separator bg-surface-muted py-2">
        <ToggleButtonGroup
          label="Session surfaces"
          orientation="vertical"
          type="single"
          value={activeSurfaceId}
          onChange={(value) => {
            // Astryx reports null when the pressed button is clicked again;
            // the inspector always shows exactly one surface.
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
                tooltip={`${meta.title} — ${meta.hint}`}
                value={surfaceId}
              />
            );
          })}
        </ToggleButtonGroup>
      </nav>
    </aside>
  );
}
