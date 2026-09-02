import { describeAnnotatedElement } from "./browser-annotation";
import type { BrowserAnnotationElement } from "@/shared/browser-protocol";

/**
 * The design-mode overlay, as it runs inside the embedded page's isolated
 * world: a host element under `<html>` with a **closed** shadow root holding
 * the hover highlight, the numbered markers and their comment bubbles.
 *
 * Electron-free on purpose — the preload only wires it to IPC — so every
 * interaction rule below is testable in jsdom.
 *
 * Two properties of the host page drive the implementation:
 *
 * - **It is hostile.** The shadow root is closed, so page script can see the
 *   host element but never read what is in it (S0 spike, third result). It can
 *   still remove the host; defending against that is out of scope for v1.
 * - **It may forbid nearly everything.** Structure is built with DOM calls and
 *   styled through CSSOM instead of `innerHTML` and a `<style>` element:
 *   Trusted Types blocks the first and a strict `style-src` the second, and
 *   the overlay has to work on pages that ship both.
 */

export const annotationOverlayHostTag = "pigui-annotation-overlay";

export type BrowserAnnotationOverlay = {
  setDesignMode(enabled: boolean): void;
  clearAnnotations(): void;
  dispose(): void;
};

const accent = "#6d28d9";
const overlayFont =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
/**
 * Pointer events design mode swallows. `click` alone is not enough: a page
 * that acts on `mousedown` would still run while the user is only marking.
 */
const pointerEvents = [
  "pointerdown",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "contextmenu",
];

function applyStyles(element: HTMLElement, styles: Record<string, string>) {
  for (const [property, value] of Object.entries(styles)) {
    // Important throughout: the host element sits in the page's own tree, so
    // a broad page rule could otherwise hide or move the whole overlay.
    element.style.setProperty(property, value, "important");
  }
}

export function createAnnotationOverlay(options: {
  document: Document;
  onAnnotationsChange: (annotations: BrowserAnnotationElement[]) => void;
  onDesignModeChange: (enabled: boolean) => void;
}): BrowserAnnotationOverlay {
  const doc = options.document;
  // The earliest node in the capture path, so page handlers registered later
  // cannot swallow the events design mode needs.
  const listenerTarget: EventTarget = doc.defaultView ?? doc;
  const annotations: BrowserAnnotationElement[] = [];
  const markers = new Map<number, { marker: HTMLElement; comment: HTMLInputElement }>();

  let designMode = false;
  let host: HTMLElement | null = null;
  let highlight: HTMLElement | null = null;
  let markerLayer: HTMLElement | null = null;
  let openComment: number | null = null;

  function ensureHost() {
    if (host) {
      return host;
    }

    const parent = doc.documentElement;

    // A preload runs before the document has a root element; every caller here
    // can only run once the user has seen the page, so this never sticks.
    if (!parent) {
      return null;
    }

    host = doc.createElement(annotationOverlayHostTag);
    applyStyles(host, {
      position: "absolute",
      inset: "0 auto auto 0",
      width: "0",
      height: "0",
      margin: "0",
      padding: "0",
      border: "0",
      "pointer-events": "none",
      "z-index": "2147483647",
    });

    const root = host.attachShadow({ mode: "closed" });

    highlight = doc.createElement("div");
    highlight.dataset.slot = "annotation-highlight";
    highlight.hidden = true;
    applyStyles(highlight, {
      position: "fixed",
      "box-sizing": "border-box",
      border: `2px solid ${accent}`,
      "border-radius": "2px",
      background: "rgba(109, 40, 217, 0.12)",
      "pointer-events": "none",
    });

    markerLayer = doc.createElement("div");
    markerLayer.dataset.slot = "annotation-markers";
    applyStyles(markerLayer, {
      position: "absolute",
      top: "0",
      left: "0",
      "pointer-events": "none",
    });

    root.append(highlight, markerLayer);
    parent.append(host);

    return host;
  }

  function notify() {
    options.onAnnotationsChange(annotations.map((annotation) => ({ ...annotation })));
  }

  /** The element the user is pointing at, or null when it is our own overlay. */
  function pageTarget(event: Event) {
    const target = event.target;

    // A closed shadow root retargets everything inside it to the host, which
    // is how clicks on a badge or a comment bubble are told apart from clicks
    // on the page.
    return target instanceof Element && target !== host ? target : null;
  }

  function hideHighlight() {
    if (highlight) {
      highlight.hidden = true;
    }
  }

  function showHighlight(element: Element) {
    if (!ensureHost() || !highlight) {
      return;
    }

    const rect = element.getBoundingClientRect();

    applyStyles(highlight, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    highlight.hidden = false;
  }

  function setCommentOpen(index: number | null) {
    openComment = index;
    for (const [markerIndex, parts] of markers) {
      parts.comment.hidden = markerIndex !== index;
    }
    if (index !== null) {
      markers.get(index)?.comment.focus();
    }
  }

  function renderMarker(annotation: BrowserAnnotationElement) {
    if (!ensureHost() || !markerLayer) {
      return;
    }

    const view = doc.defaultView;
    const marker = doc.createElement("div");

    applyStyles(marker, {
      position: "absolute",
      // Document coordinates, so a marker stays on its element as the page
      // scrolls. The reported rect stays viewport-relative, as measured.
      left: `${annotation.rect.x + (view?.scrollX ?? 0)}px`,
      top: `${annotation.rect.y + (view?.scrollY ?? 0)}px`,
      display: "flex",
      "align-items": "flex-start",
      gap: "4px",
    });

    const badge = doc.createElement("button");

    badge.type = "button";
    badge.dataset.slot = "annotation-badge";
    badge.textContent = String(annotation.index);
    applyStyles(badge, {
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      "min-width": "20px",
      height: "20px",
      margin: "0",
      padding: "0 5px",
      border: "0",
      "border-radius": "10px",
      background: accent,
      color: "#ffffff",
      font: `600 11px/20px ${overlayFont}`,
      cursor: "pointer",
      "box-shadow": "0 1px 3px rgba(0, 0, 0, 0.35)",
    });
    badge.addEventListener("click", () => {
      setCommentOpen(openComment === annotation.index ? null : annotation.index);
    });

    const comment = doc.createElement("input");

    comment.dataset.slot = "annotation-comment";
    comment.type = "text";
    comment.placeholder = "What is wrong here?";
    comment.value = annotation.comment ?? "";
    comment.hidden = true;
    applyStyles(comment, {
      width: "220px",
      margin: "0",
      padding: "3px 6px",
      border: `1px solid ${accent}`,
      "border-radius": "4px",
      background: "#ffffff",
      color: "#111827",
      font: `400 12px/16px ${overlayFont}`,
      "box-shadow": "0 1px 3px rgba(0, 0, 0, 0.35)",
    });
    comment.addEventListener("input", () => {
      const stored = annotations.find((entry) => entry.index === annotation.index);

      if (!stored) {
        return;
      }

      if (comment.value) {
        stored.comment = comment.value;
      } else {
        delete stored.comment;
      }
      notify();
    });
    comment.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        setCommentOpen(null);
      }
    });

    marker.append(badge, comment);
    markerLayer.append(marker);
    markers.set(annotation.index, { marker, comment });
  }

  function addAnnotation(element: Element) {
    const annotation = describeAnnotatedElement(element, annotations.length + 1);

    annotations.push(annotation);
    renderMarker(annotation);
    notify();
  }

  function applyDesignMode(enabled: boolean) {
    designMode = enabled;

    if (enabled) {
      ensureHost();
    } else {
      hideHighlight();
      setCommentOpen(null);
    }

    // Markers only take pointer events while marking; once design mode is off
    // the page has to be fully usable again with the marks still on screen.
    if (markerLayer) {
      applyStyles(markerLayer, { "pointer-events": enabled ? "auto" : "none" });
    }
  }

  function handlePointerMove(event: Event) {
    if (!designMode) {
      return;
    }

    const target = pageTarget(event);

    if (target) {
      showHighlight(target);
    } else {
      hideHighlight();
    }
  }

  function handlePointerEvent(event: Event) {
    if (!designMode) {
      return;
    }

    const target = pageTarget(event);

    // Our own badges and bubbles have to keep working, so their events are
    // left entirely alone.
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.type === "click") {
      addAnnotation(target);
    }
  }

  function handleKeyDown(event: Event) {
    const keyboardEvent = event as KeyboardEvent;

    // Typing a comment must not trigger the page's own keyboard shortcuts.
    if (!pageTarget(event)) {
      event.stopPropagation();
    }

    if (!designMode || keyboardEvent.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (openComment !== null) {
      setCommentOpen(null);
      return;
    }

    applyDesignMode(false);
    options.onDesignModeChange(false);
  }

  for (const type of pointerEvents) {
    listenerTarget.addEventListener(type, handlePointerEvent, true);
  }
  listenerTarget.addEventListener("pointermove", handlePointerMove, true);
  listenerTarget.addEventListener("mousemove", handlePointerMove, true);
  listenerTarget.addEventListener("keydown", handleKeyDown, true);

  return {
    setDesignMode(enabled) {
      // No notification back: this is main answering its own command, and an
      // echo would fight the renderer's own state.
      applyDesignMode(enabled);
    },

    clearAnnotations() {
      annotations.length = 0;
      for (const { marker } of markers.values()) {
        marker.remove();
      }
      markers.clear();
      openComment = null;
      notify();
    },

    dispose() {
      for (const type of pointerEvents) {
        listenerTarget.removeEventListener(type, handlePointerEvent, true);
      }
      listenerTarget.removeEventListener("pointermove", handlePointerMove, true);
      listenerTarget.removeEventListener("mousemove", handlePointerMove, true);
      listenerTarget.removeEventListener("keydown", handleKeyDown, true);
      host?.remove();
      host = null;
      highlight = null;
      markerLayer = null;
      markers.clear();
      annotations.length = 0;
    },
  };
}
