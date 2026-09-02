import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BrowserAnnotationElement,
  BrowserAnnotationViewport,
} from "@/shared/browser-protocol";
import {
  annotationOverlayHostTag,
  createAnnotationOverlay,
  type BrowserAnnotationOverlay,
} from "./browser-annotation-overlay";

/**
 * The overlay lives in a closed shadow root, which is exactly what makes it
 * unreachable from the page — and from a test. Capturing the roots as they are
 * attached is the only way to drive the comment bubble the way a user does;
 * everything else is asserted through the callbacks the preload subscribes to.
 */
const shadowRoots: ShadowRoot[] = [];
let overlay: BrowserAnnotationOverlay | null = null;

function harness() {
  const annotationChanges: BrowserAnnotationElement[][] = [];
  const viewports: BrowserAnnotationViewport[] = [];
  const designModeChanges: boolean[] = [];
  const captures: {
    annotations: BrowserAnnotationElement[];
    viewport: BrowserAnnotationViewport;
  }[] = [];

  overlay = createAnnotationOverlay({
    document,
    onAnnotationsChange: (annotations, viewport) => {
      annotationChanges.push(annotations);
      viewports.push(viewport);
    },
    onDesignModeChange: (enabled) => designModeChanges.push(enabled),
    onCaptureReady: (annotations, viewport) => captures.push({ annotations, viewport }),
  });

  return {
    overlay,
    annotationChanges,
    viewports,
    designModeChanges,
    captures,
    latest: () => annotationChanges[annotationChanges.length - 1] ?? [],
    shadow: () => shadowRoots[shadowRoots.length - 1]!,
  };
}

function clickPageElement(element: Element) {
  element.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }),
  );
}

function pressKey(target: EventTarget, key: string) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true }),
  );
}

function rectAt(x: number, y: number) {
  return {
    x,
    y,
    width: 40,
    height: 20,
    left: x,
    top: y,
    right: x + 40,
    bottom: y + 20,
    toJSON: () => ({}),
  } as DOMRect;
}

/** jsdom runs rAF on a timer; two frames is enough for a scheduled sync. */
function nextFrames() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

beforeEach(() => {
  const attachShadow = Element.prototype.attachShadow;

  shadowRoots.length = 0;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function attach(
    this: Element,
    init: ShadowRootInit,
  ) {
    const root = attachShadow.call(this, init);

    shadowRoots.push(root);
    return root;
  });
  document.body.innerHTML = '<main><button id="cta">Go</button><p id="copy">c</p></main>';
});

afterEach(() => {
  overlay?.dispose();
  overlay = null;
  vi.restoreAllMocks();
});

describe("annotation overlay", () => {
  it("marks an element only while design mode is on, and keeps the click from the page", () => {
    const { overlay, annotationChanges, latest } = harness();
    const pageClicks = vi.fn();
    const button = document.getElementById("cta")!;

    button.addEventListener("click", pageClicks);

    clickPageElement(button);

    expect(annotationChanges).toHaveLength(0);
    expect(pageClicks).toHaveBeenCalledTimes(1);

    overlay.setDesignMode(true);
    clickPageElement(button);

    // The page must not act on a click the user meant as "mark this".
    expect(pageClicks).toHaveBeenCalledTimes(1);
    expect(latest()).toHaveLength(1);
    expect(latest()[0]).toMatchObject({ index: 1, selector: "#cta", tag: "button" });
  });

  it("numbers markers in the order they were clicked", () => {
    const { overlay, latest } = harness();

    overlay.setDesignMode(true);
    clickPageElement(document.getElementById("cta")!);
    clickPageElement(document.getElementById("copy")!);

    expect(latest().map((annotation) => [annotation.index, annotation.selector])).toEqual([
      [1, "#cta"],
      [2, "#copy"],
    ]);
  });

  it("leaves design mode on Escape and keeps the marks that were made", () => {
    const { overlay, designModeChanges, latest } = harness();

    overlay.setDesignMode(true);
    clickPageElement(document.getElementById("cta")!);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(designModeChanges).toEqual([false]);

    // Marks outlive design mode — they are what the screenshot has to show.
    clickPageElement(document.getElementById("copy")!);
    expect(latest()).toHaveLength(1);
  });

  it("reports the page's own viewport alongside the marks", () => {
    const { overlay, viewports } = harness();

    for (const [property, value] of Object.entries({
      innerWidth: 684,
      innerHeight: 820,
      devicePixelRatio: 2,
    })) {
      Object.defineProperty(window, property, { configurable: true, value });
    }

    overlay.setDesignMode(true);
    clickPageElement(document.getElementById("cta")!);

    // The marks are measured in the page's viewport, not the panel's rect —
    // and the panel can be resized between marking and sending.
    expect(viewports[viewports.length - 1]).toEqual({
      width: 684,
      height: 820,
      dpr: 2,
    });
  });

  it("settles the overlay before a capture and acks what the page then holds", () => {
    const { overlay, shadow, captures } = harness();
    const button = document.getElementById("cta")!;

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });

    overlay.setDesignMode(true);
    button.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, cancelable: true, composed: true }),
    );
    clickPageElement(button);
    clickPageElement(shadow().querySelector('[data-slot="annotation-badge"]')!);

    const comment = shadow().querySelector<HTMLInputElement>(
      '[data-slot="annotation-comment"]',
    )!;
    const highlight = shadow().querySelector<HTMLElement>(
      '[data-slot="annotation-highlight"]',
    )!;

    comment.value = "Too small to hit";

    overlay.prepareCapture();

    // Nothing of the overlay's own chrome may reach the screenshot, and the
    // comment being typed has to reach the payload — a keyboard-driven Send
    // never blurs the input, so committing on the way out is the only chance.
    expect(comment.hidden).toBe(true);
    expect(highlight.hidden).toBe(true);
    expect(captures[captures.length - 1]).toEqual({
      annotations: [expect.objectContaining({ index: 1, comment: "Too small to hit" })],
      // Measured now: the panel may have been dragged since the mark was made.
      viewport: { width: 900, height: window.innerHeight, dpr: window.devicePixelRatio },
    });
  });

  it("drops the hover highlight when the pointer leaves the page", () => {
    const { overlay, shadow } = harness();
    const button = document.getElementById("cta")!;
    const hover = (target: Element) =>
      target.dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, cancelable: true, composed: true }),
      );
    const leave = (target: Element, relatedTarget: Element | null) =>
      target.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          cancelable: true,
          composed: true,
          relatedTarget,
        }),
      );

    overlay.setDesignMode(true);
    hover(button);

    const highlight = shadow().querySelector<HTMLElement>(
      '[data-slot="annotation-highlight"]',
    )!;

    expect(highlight.hidden).toBe(false);

    // Moving between two elements is not leaving: the highlight has to follow
    // the pointer, and the next pointermove is what moves it.
    leave(button, document.getElementById("copy"));
    expect(highlight.hidden).toBe(false);

    // Reaching the toolbar takes the pointer out of the page entirely, and a
    // highlight that follows the pointer must not go on framing an element the
    // pointer has left.
    leave(button, null);
    expect(highlight.hidden).toBe(true);
  });

  it("ignores clicks that land on its own overlay", () => {
    const { overlay, annotationChanges } = harness();

    overlay.setDesignMode(true);

    const host = document.querySelector(annotationOverlayHostTag)!;

    clickPageElement(host);

    expect(annotationChanges).toHaveLength(0);
  });

  it("sends a comment once it is committed, not on every keystroke", () => {
    const { overlay, shadow, annotationChanges, latest } = harness();

    overlay.setDesignMode(true);
    clickPageElement(document.getElementById("cta")!);

    const badge = shadow().querySelector<HTMLElement>('[data-slot="annotation-badge"]')!;
    const comment = shadow().querySelector<HTMLInputElement>(
      '[data-slot="annotation-comment"]',
    )!;

    expect(badge.textContent).toBe("1");
    expect(comment.hidden).toBe(true);

    clickPageElement(badge);
    expect(comment.hidden).toBe(false);

    const changesBeforeTyping = annotationChanges.length;

    comment.value = "This button is too small";
    comment.dispatchEvent(new Event("input", { bubbles: true }));

    // Typing must not cost an IPC round trip per character.
    expect(annotationChanges).toHaveLength(changesBeforeTyping);

    // Enter closes the bubble. The overlay's own keydown handler runs in the
    // capture phase at the window, so it is the only one that can see this.
    pressKey(comment, "Enter");

    expect(comment.hidden).toBe(true);
    expect(latest()[0]!.comment).toBe("This button is too small");
  });

  it("closes an open bubble on Escape before it stops marking, keeping the text", () => {
    const { overlay, shadow, designModeChanges, latest } = harness();

    overlay.setDesignMode(true);
    clickPageElement(document.getElementById("cta")!);
    clickPageElement(shadow().querySelector('[data-slot="annotation-badge"]')!);

    const comment = shadow().querySelector<HTMLInputElement>(
      '[data-slot="annotation-comment"]',
    )!;

    comment.value = "Too small";
    pressKey(comment, "Escape");

    expect(comment.hidden).toBe(true);
    expect(designModeChanges).toEqual([]);
    expect(latest()[0]!.comment).toBe("Too small");
  });

  it("marks the element inside the page's own shadow root, not its host", () => {
    const { overlay, latest } = harness();
    const widget = document.createElement("div");

    widget.id = "widget";
    document.body.append(widget);

    const inner = document.createElement("a");

    inner.textContent = "Inner link";
    widget.attachShadow({ mode: "open" }).append(inner);

    overlay.setDesignMode(true);
    clickPageElement(inner);

    // `event.target` is retargeted to the host at the window; the composed
    // path still names what the user actually pointed at.
    expect(latest()[0]).toMatchObject({ tag: "a", text: "Inner link" });
  });

  it("keeps a marker on its element as the page scrolls", async () => {
    const { overlay, shadow } = harness();
    const button = document.getElementById("cta")!;
    const measure = vi.spyOn(button, "getBoundingClientRect");

    measure.mockReturnValue(rectAt(12, 200));
    overlay.setDesignMode(true);
    clickPageElement(button);

    const marker = shadow().querySelector<HTMLElement>('[data-slot="annotation-marker"]')!;

    expect(marker.style.top).toBe("200px");

    measure.mockReturnValue(rectAt(12, 40));
    window.dispatchEvent(new Event("scroll"));
    await nextFrames();

    // A marker pinned to where the element was would sit over the wrong thing
    // in the page and on S3's screenshot.
    expect(marker.style.top).toBe("40px");

    // An element a re-render took away has no position to sit at; the marker
    // must not fall back to the top-left corner of the viewport.
    button.remove();
    window.dispatchEvent(new Event("scroll"));
    await nextFrames();

    expect(marker.style.display).toBe("none");
  });

  it("arms its markers when the overlay is built after design mode was on", () => {
    const { overlay, shadow } = harness();
    const root = document.documentElement;
    const button = document.getElementById("cta")!;

    // A preload runs before the document has a root element to hang the
    // overlay on, and main re-applies design mode the moment it reports in.
    root.remove();
    overlay.setDesignMode(true);
    document.append(root);

    clickPageElement(button);

    expect(
      shadow().querySelector<HTMLElement>('[data-slot="annotation-markers"]')!.style
        .pointerEvents,
    ).toBe("auto");
  });

  it("clears every mark on demand", () => {
    const { overlay, latest, shadow } = harness();

    overlay.setDesignMode(true);
    clickPageElement(document.getElementById("cta")!);
    overlay.clearAnnotations();

    expect(latest()).toEqual([]);
    expect(shadow().querySelector('[data-slot="annotation-badge"]')).toBeNull();
  });

  it("takes its overlay and its listeners with it when disposed", () => {
    const { overlay, annotationChanges } = harness();

    overlay.setDesignMode(true);
    overlay.dispose();

    expect(document.querySelector(annotationOverlayHostTag)).toBeNull();

    clickPageElement(document.getElementById("cta")!);
    expect(annotationChanges).toHaveLength(0);
  });
});
