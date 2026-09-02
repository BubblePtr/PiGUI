import { describeAnnotatedElement } from "./browser-annotation";
import type {
  BrowserAnnotationElement,
  BrowserAnnotationViewport,
} from "@/shared/browser-protocol";

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

type MarkerEntry = {
  annotation: BrowserAnnotationElement;
  /** Kept so the marker can be re-measured; the rect it reported cannot. */
  element: Element;
  marker: HTMLElement;
  comment: HTMLInputElement;
};

export type BrowserAnnotationOverlay = {
  setDesignMode(enabled: boolean): void;
  clearAnnotations(): void;
  /**
   * Put the overlay out of shot and say what it holds, so main can photograph
   * the page without the overlay's own chrome on it.
   */
  prepareCapture(): void;
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
  onAnnotationsChange: (
    annotations: BrowserAnnotationElement[],
    viewport: BrowserAnnotationViewport,
  ) => void;
  onDesignModeChange: (enabled: boolean) => void;
  /** The ack main waits for before it shoots. */
  onCaptureReady: (
    annotations: BrowserAnnotationElement[],
    viewport: BrowserAnnotationViewport,
  ) => void;
}): BrowserAnnotationOverlay {
  const doc = options.document;
  // The earliest node in the capture path, so page handlers registered later
  // cannot swallow the events design mode needs.
  const listenerTarget: EventTarget = doc.defaultView ?? doc;
  const annotations: BrowserAnnotationElement[] = [];
  const markers = new Map<number, MarkerEntry>();

  let designMode = false;
  let host: HTMLElement | null = null;
  let highlight: HTMLElement | null = null;
  let markerLayer: HTMLElement | null = null;
  let openComment: number | null = null;
  let markerSyncFrame = 0;

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
      // Design mode can be turned on before the document has a root element to
      // hang this on, so the layer arms itself from the current state rather
      // than waiting for the next toggle.
      "pointer-events": designMode ? "auto" : "none",
    });

    root.append(highlight, markerLayer);
    parent.append(host);

    return host;
  }

  /**
   * The page's own viewport, which is the space every rect above was measured
   * in — and, unlike the panel's rect on the other side of the IPC, it is
   * still the right one when the user resizes the panel before sending.
   */
  function readViewport(): BrowserAnnotationViewport {
    const view = doc.defaultView;

    return {
      width: view?.innerWidth ?? 0,
      height: view?.innerHeight ?? 0,
      dpr: view?.devicePixelRatio ?? 1,
    };
  }

  function notify() {
    options.onAnnotationsChange(
      annotations.map((annotation) => ({ ...annotation })),
      readViewport(),
    );
  }

  /** The element the user is pointing at, or null when it is our own overlay. */
  function pageTarget(event: Event) {
    // `event.target` is retargeted to the shadow host at the window, which for
    // a page's own (open) shadow DOM would name the wrapper instead of what
    // the user pointed at. The composed path names the real element — and
    // stops at our host for our own closed root, which is how clicks on a
    // badge or a bubble are still told apart from clicks on the page.
    const [target] = event.composedPath();

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

  /**
   * A comment reaches main when the bubble is committed — Enter, a blur, or the
   * bubble closing — never per keystroke: every notification is a full IPC
   * round trip carrying the whole list.
   */
  function commitComment(entry: MarkerEntry) {
    const value = entry.comment.value;

    if (value === (entry.annotation.comment ?? "")) {
      return;
    }

    if (value) {
      entry.annotation.comment = value;
    } else {
      delete entry.annotation.comment;
    }
    notify();
  }

  function setCommentOpen(index: number | null) {
    const open = openComment === null ? null : markers.get(openComment);

    if (open) {
      commitComment(open);
    }

    openComment = index;
    for (const [markerIndex, entry] of markers) {
      entry.comment.hidden = markerIndex !== index;
    }
    if (index !== null) {
      markers.get(index)?.comment.focus();
    }
  }

  /**
   * Markers are fixed to the viewport and re-measured, not pinned to where the
   * element was when it was marked: a scroll — of the window or of any nested
   * container — or a reflow would otherwise leave the number sitting over
   * something else, in the page and on S3's screenshot alike.
   */
  function positionMarker(entry: MarkerEntry) {
    // `hidden` cannot win against the important display below, and an element
    // a re-render took away measures as 0,0 — which would park the number in
    // the corner of the viewport rather than take it off screen.
    if (!entry.element.isConnected) {
      applyStyles(entry.marker, { display: "none" });
      return;
    }

    const rect = entry.element.getBoundingClientRect();

    applyStyles(entry.marker, {
      display: "flex",
      left: `${rect.x}px`,
      top: `${rect.y}px`,
    });
  }

  function scheduleMarkerSync() {
    const view = doc.defaultView;

    if (!view || markerSyncFrame || markers.size === 0) {
      return;
    }

    markerSyncFrame = view.requestAnimationFrame(() => {
      markerSyncFrame = 0;
      for (const entry of markers.values()) {
        positionMarker(entry);
      }
    });
  }

  function renderMarker(annotation: BrowserAnnotationElement, element: Element) {
    if (!ensureHost() || !markerLayer) {
      return;
    }

    const marker = doc.createElement("div");

    marker.dataset.slot = "annotation-marker";
    // Placement and display both come from positionMarker below, which is the
    // only thing that knows whether the element is still on the page.
    applyStyles(marker, {
      position: "fixed",
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

    const entry: MarkerEntry = { annotation, element, marker, comment };

    // A blur is a commit; Enter and Escape go through the overlay's own
    // keydown handler, which is the only one that sees them.
    comment.addEventListener("change", () => commitComment(entry));
    comment.addEventListener("blur", () => commitComment(entry));

    marker.append(badge, comment);
    markerLayer.append(marker);
    markers.set(annotation.index, entry);
    positionMarker(entry);
  }

  function addAnnotation(element: Element) {
    const annotation = describeAnnotatedElement(element, annotations.length + 1);

    annotations.push(annotation);
    renderMarker(annotation, element);
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

  /**
   * The pointer left the document — `relatedTarget` is null only then, which
   * is what tells this apart from moving between two elements in the page.
   *
   * It matters because leaving the page is how the user reaches the toolbar,
   * and `Send to composer` photographs the page: a highlight still framing the
   * last hovered element would be printed on the screenshot Pi reads.
   */
  function handlePointerOut(event: Event) {
    if (designMode && !(event as MouseEvent).relatedTarget) {
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
    const { key } = event as KeyboardEvent;
    const fromOverlay = !pageTarget(event);

    // Typing a comment must not trigger the page's own keyboard shortcuts —
    // which also means the bubble's own listeners never see the keys, so Enter
    // is answered here rather than on the input.
    if (fromOverlay) {
      event.stopPropagation();

      if (key === "Enter" && openComment !== null) {
        event.preventDefault();
        setCommentOpen(null);
        return;
      }
    }

    if (!designMode || key !== "Escape") {
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
  listenerTarget.addEventListener("mouseout", handlePointerOut, true);
  listenerTarget.addEventListener("keydown", handleKeyDown, true);
  // Scroll does not bubble, so the capture phase is the only way to hear one
  // from a nested container; passive, because this never cancels anything.
  listenerTarget.addEventListener("scroll", scheduleMarkerSync, {
    capture: true,
    passive: true,
  });
  listenerTarget.addEventListener("resize", scheduleMarkerSync, true);

  return {
    setDesignMode(enabled) {
      // No notification back: this is main answering its own command, and an
      // echo would fight the renderer's own state.
      applyDesignMode(enabled);
    },

    prepareCapture() {
      // Closing the bubble commits it: a Send driven from the keyboard never
      // blurs the input, so this is the only moment the comment the user just
      // typed can still reach the payload. It also takes the input and the
      // hover box out of the frame — both are overlay chrome, and neither
      // belongs in a screenshot of the user's page.
      setCommentOpen(null);
      hideHighlight();
      // Measured now rather than when the mark was made: the panel can have
      // been dragged wider since, and the shot is being taken at this size.
      options.onCaptureReady(
        annotations.map((annotation) => ({ ...annotation })),
        readViewport(),
      );
    },

    clearAnnotations() {
      // No commit on the way out: clearing throws the marks away, comments and
      // all, so there is nothing left to report but the empty list.
      openComment = null;
      annotations.length = 0;
      for (const { marker } of markers.values()) {
        marker.remove();
      }
      markers.clear();
      notify();
    },

    dispose() {
      for (const type of pointerEvents) {
        listenerTarget.removeEventListener(type, handlePointerEvent, true);
      }
      listenerTarget.removeEventListener("pointermove", handlePointerMove, true);
      listenerTarget.removeEventListener("mouseout", handlePointerOut, true);
      listenerTarget.removeEventListener("keydown", handleKeyDown, true);
      listenerTarget.removeEventListener("scroll", scheduleMarkerSync, true);
      listenerTarget.removeEventListener("resize", scheduleMarkerSync, true);
      host?.remove();
      host = null;
      highlight = null;
      markerLayer = null;
      markers.clear();
      annotations.length = 0;
    },
  };
}
