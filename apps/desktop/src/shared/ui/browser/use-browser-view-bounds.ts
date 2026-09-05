import { useEffect, type RefObject } from "react";
import type { BrowserViewRect } from "@/shared/browser-protocol";

/**
 * Keeps the main process's native view aligned with a renderer placeholder.
 *
 * The dock's width bound is only computed at mount and the live width is
 * a `style` value that changes per drag frame, so the placeholder's own rect
 * is the single source of truth (PRD section 6). The header band and the
 * resize handle's gutter are already outside that rect, so nothing is
 * subtracted here — main only caps it against the window.
 *
 * `ResizeObserver` covers panel drags (the placeholder's width changes with
 * the panel); the window `resize` listener covers moves that leave the size
 * alone but shift the origin.
 */
export function useBrowserViewBounds(
  target: RefObject<HTMLElement | null>,
  onRectChange: (rect: BrowserViewRect) => void,
  enabled: boolean,
) {
  useEffect(() => {
    const element = target.current;

    if (!enabled || !element || typeof window === "undefined") {
      return;
    }

    let lastSignature = "";
    const push = () => {
      const rect = element.getBoundingClientRect();
      const next = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      const signature = `${next.x}:${next.y}:${next.width}:${next.height}`;

      // A drag fires the observer per frame; only real moves cost an IPC hop.
      if (signature === lastSignature) {
        return;
      }

      lastSignature = signature;
      onRectChange(next);
    };

    push();

    const observer = new ResizeObserver(push);

    observer.observe(element);
    window.addEventListener("resize", push);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", push);
    };
  }, [enabled, onRectChange, target]);
}
