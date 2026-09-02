import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserAnnotationElement } from "@/shared/browser-protocol";
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
  const designModeChanges: boolean[] = [];

  overlay = createAnnotationOverlay({
    document,
    onAnnotationsChange: (annotations) => annotationChanges.push(annotations),
    onDesignModeChange: (enabled) => designModeChanges.push(enabled),
  });

  return {
    overlay,
    annotationChanges,
    designModeChanges,
    latest: () => annotationChanges[annotationChanges.length - 1] ?? [],
    shadow: () => shadowRoots[shadowRoots.length - 1]!,
  };
}

function clickPageElement(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
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

  it("ignores clicks that land on its own overlay", () => {
    const { overlay, annotationChanges } = harness();

    overlay.setDesignMode(true);

    const host = document.querySelector(annotationOverlayHostTag)!;

    clickPageElement(host);

    expect(annotationChanges).toHaveLength(0);
  });

  it("records a comment typed into a marker's bubble", () => {
    const { overlay, shadow, designModeChanges, latest } = harness();

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

    comment.value = "This button is too small";
    comment.dispatchEvent(new Event("input", { bubbles: true }));

    expect(latest()[0]!.comment).toBe("This button is too small");

    // Escape closes the bubble the user is in before it means "stop marking".
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(comment.hidden).toBe(true);
    expect(designModeChanges).toEqual([]);
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
