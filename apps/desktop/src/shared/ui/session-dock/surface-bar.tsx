import { IconButton } from "@astryxdesign/core/IconButton";
import type { ComponentType, ReactNode } from "react";
import { Cancel, Plus } from "@/shared/ui/icons";

/**
 * The Session surface's first row (ADR-0028, 2026-09-05 revision).
 *
 * The dock has no header of its own: the rail names the surface, so the 40px
 * band at the top of the panel belongs to the surface and carries its state
 * and actions instead of a second label. Multi-instance surfaces fill it with
 * `SessionSurfaceTabs`; single-instance ones put their own status and actions
 * in the two slots.
 *
 * Astryx's Toolbar covers the same idea, but not this constraint: it sizes
 * itself from `--size-element-*` plus its own block padding, and its roving
 * tabindex would nest inside the tab strip's own arrow-key model.
 */
export function SessionSurfaceBar({
  actions,
  children,
}: {
  /**
   * Right-hand slot. Reserved even when a surface has nothing to put there
   * yet — Changes will grow checkout / commit / push actions (ADR-0008).
   */
  actions?: ReactNode;
  /** Left-hand slot: what the surface currently is. */
  children: ReactNode;
}) {
  return (
    // h-10 puts the row on the same baseline as Chat's title band. px-2 is the
    // flush surfaces' inset: every leading element here is a control with its
    // own ~8px padding, which lands its icon on the same 16px column as the
    // content below. The `data-slot` is what styles.css lifts out of the
    // window's drag region — sharing that band means the chrome would
    // otherwise swallow every click here.
    <div
      className="flex h-10 shrink-0 items-center gap-2 px-2"
      data-slot="session-surface-bar"
      data-testid="session-surface-bar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </div>
  );
}

export type SessionSurfaceTabItem = {
  id: string;
  label: string;
  /** Native tooltip for the tab, e.g. the shell's working directory. */
  hint?: string;
  /** The instance is gone but its output is still worth reading. */
  isExited?: boolean;
};

/**
 * Instance strip for a multi-instance surface: one tab per instance, each with
 * its own close button, and a trailing button for a new one. Terminal is the
 * first consumer; Browser (#185) reuses it rather than drawing its own.
 *
 * Hand-rolled because Astryx renders each Tab as a single `<button>`, which
 * cannot legally nest the per-tab close button.
 */
export function SessionSurfaceTabs({
  activeId,
  addLabel,
  icon: TabIcon,
  items,
  label,
  onActivate,
  onAdd,
  onClose,
}: {
  activeId: string | null;
  /** Label and tooltip of the trailing new-instance button. */
  addLabel: string;
  /** Surface icon, repeated per tab so a dense strip stays scannable. */
  icon: ComponentType<{ className?: string }>;
  items: readonly SessionSurfaceTabItem[];
  /** Accessible name of the strip, e.g. "Terminal instances". */
  label: string;
  onActivate: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}) {
  return (
    <div
      aria-label={label}
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      role="tablist"
    >
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <span
            className={`flex shrink-0 items-center rounded-md text-xs ${
              isActive
                ? "bg-surface-muted text-foreground"
                : "text-muted hover:bg-surface-hover"
            }`}
            key={item.id}
          >
            <button
              aria-selected={isActive}
              className="flex items-center gap-1.5 rounded-l-md py-1 pl-2 pr-1 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/20"
              role="tab"
              title={item.hint}
              type="button"
              onClick={() => onActivate(item.id)}
            >
              <TabIcon className="size-3.5" />
              <span className={item.isExited ? "text-muted" : undefined}>
                {item.label}
              </span>
              {item.isExited ? <span className="text-muted"> (exited)</span> : null}
            </button>
            <button
              aria-label={`Close ${item.label}`}
              className="rounded-r-md py-1 pl-0.5 pr-1.5 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/20"
              type="button"
              onClick={() => onClose(item.id)}
            >
              <Cancel className="size-3" />
            </button>
          </span>
        );
      })}
      <IconButton
        icon={<Plus className="size-4" />}
        label={addLabel}
        size="sm"
        tooltip={addLabel}
        variant="ghost"
        onClick={onAdd}
      />
    </div>
  );
}
