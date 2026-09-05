import { useEffect, useState } from "react";

/**
 * Reports whether any DOM overlay is currently open.
 *
 * The embedded browser is a native child view painted over the renderer, so it
 * covers every DOM layer above it — including the inspector rail's own
 * tooltips, which sit right against it. The surface swaps in a still of the
 * page while an overlay is up, and that swap needs a reliable "is anything
 * open" signal.
 *
 * The two overlay stacks in this app announce themselves very differently, and
 * neither can be detected the way the other is:
 *
 * - **Astryx layers** (Tooltip, Popover, Menu, Select) render a `[popover]`
 *   element inline in the trigger's own subtree. It is in the DOM whether open
 *   or closed, and opening calls `showPopover()`, which changes no attribute
 *   and moves no node — a MutationObserver never fires. The Popover API's
 *   `toggle` event is the only signal, and since it does not bubble it has to
 *   be caught in the capture phase.
 * - **Base UI overlays** (Dialog) mount a
 *   `[data-base-ui-portal]` subtree on `body` and mark the live popup with
 *   `data-open`. No popover involved, so the MutationObserver is what sees it.
 *   The portal check is what keeps inline `data-open` components — Collapsible
 *   in the chat column — from counting as overlays.
 */
const baseUiOpenOverlay = "[data-base-ui-portal] [data-open]";

function isPopoverOpen(element: Element) {
  if (element.matches(":popover-open")) {
    return true;
  }

  // Astryx falls back to plain visibility where the Popover API is missing
  // (Safari <17, Firefox <125 — and jsdom, which is what the tests drive).
  return (element as HTMLElement).style.display === "block";
}

function hasOpenOverlay() {
  for (const element of Array.from(document.querySelectorAll("[popover]"))) {
    if (isPopoverOpen(element)) {
      return true;
    }
  }

  return document.querySelector(baseUiOpenOverlay) !== null;
}

export function useOverlayPresence(enabled: boolean) {
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      setOverlayOpen(false);
      return;
    }

    const sync = () => setOverlayOpen(hasOpenOverlay());
    const observer = new MutationObserver(sync);

    sync();
    observer.observe(document.body, {
      attributeFilter: ["style", "data-open", "popover"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    document.addEventListener("toggle", sync, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("toggle", sync, true);
    };
  }, [enabled]);

  return overlayOpen;
}
