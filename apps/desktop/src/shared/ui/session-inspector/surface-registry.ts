import type { ComponentType } from "react";
import { FileDiff, Terminal } from "@/shared/ui/icons";

/**
 * Registry of the Session-scoped surfaces the SessionInspector can host.
 *
 * Metadata only: the panel content stays with the feature that owns the data
 * (Changes, Terminal), so the registry never grows a dependency on
 * Session state. File / Browser surfaces remain deferred by ADR-0007.
 */
export type SessionSurfaceId = "changes" | "terminal";

export type SessionSurfaceMeta = {
  id: SessionSurfaceId;
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** One line of context, shown next to the title and in the rail tooltip. */
  hint: string;
  /**
   * Multi-instance surfaces keep a single rail icon and list their instances
   * in the panel header (ADR-0028). Terminal is the first one: shells come
   * and go, the rail icon and its instance-count badge stay put.
   */
  multiInstance?: boolean;
  /**
   * Flush surfaces render edge-to-edge: the inspector drops its content
   * padding and the surface owns every inset itself (terminal canvases want
   * this; documents and forms want the default padding).
   */
  flushContent?: boolean;
};

export const sessionSurfaceOrder = [
  "changes",
  "terminal",
] as const satisfies readonly SessionSurfaceId[];

export const sessionSurfaces: Record<SessionSurfaceId, SessionSurfaceMeta> = {
  changes: {
    id: "changes",
    title: "Changes",
    icon: FileDiff,
    hint: "Working tree for this Session checkout",
    flushContent: true,
  },
  terminal: {
    id: "terminal",
    title: "Terminal",
    icon: Terminal,
    hint: "Shells in this Session's checkout",
    multiInstance: true,
    flushContent: true,
  },
};
