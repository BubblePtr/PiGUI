import type { ComponentType } from "react";
import { FileDiff, Wrench } from "@/shared/ui/icons";

/**
 * Registry of the Session-scoped surfaces the SessionInspector can host.
 *
 * Metadata only: the panel content stays with the feature that owns the data
 * (Changes, Actions), so the registry never grows a dependency on Session
 * state. Terminal / File / Browser surfaces remain deferred by ADR-0007.
 */
export type SessionSurfaceId = "changes" | "actions";

export type SessionSurfaceMeta = {
  id: SessionSurfaceId;
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** One line of context, shown next to the title and in the rail tooltip. */
  hint: string;
  /**
   * Multi-instance surfaces keep a single rail icon and list their instances
   * in the panel header (ADR-0024). No v1 surface is multi-instance, so the
   * instance strip is not built yet.
   */
  multiInstance?: boolean;
};

export const sessionSurfaceOrder = [
  "changes",
  "actions",
] as const satisfies readonly SessionSurfaceId[];

export const sessionSurfaces: Record<SessionSurfaceId, SessionSurfaceMeta> = {
  changes: {
    id: "changes",
    title: "Changes",
    icon: FileDiff,
    hint: "Working tree for this Session checkout",
  },
  actions: {
    id: "actions",
    title: "Actions",
    icon: Wrench,
    hint: "Checkout, model, cost, and lifecycle",
  },
};
