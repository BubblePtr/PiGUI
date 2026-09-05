import type { ComponentType } from "react";
import { FileDiff, Globe, Terminal } from "@/shared/ui/icons";

/**
 * Registry of the Session-scoped surfaces the SessionInspector can host.
 *
 * Metadata only: the panel content stays with the feature that owns the data
 * (Changes, Terminal, Browser), so the registry never grows a dependency on
 * Session state. The File surface remains deferred by ADR-0007.
 */
export type SessionSurfaceId = "changes" | "terminal" | "browser";

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
  "browser",
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
  browser: {
    id: "browser",
    title: "Browser",
    icon: Globe,
    hint: "Preview a running dev server",
    flushContent: true,
  },
};
