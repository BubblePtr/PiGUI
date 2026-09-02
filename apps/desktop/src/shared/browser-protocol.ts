/**
 * Wire contract for the embedded browser surface.
 *
 * The view is a native `WebContentsView` owned by the Electron main process —
 * it never reaches the utilityProcess backend, so the embedded page can never
 * touch the Runtime Gateway MessagePort (ADR-0013). Main, preload and the
 * renderer share only the shapes below.
 */

import type {
  BrowserAnnotationElement,
  BrowserAnnotationViewport,
} from "@pigui/core";

export type BrowserViewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** What the view itself can answer about the page it is showing. */
export type BrowserViewSnapshot = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type BrowserViewState = BrowserViewSnapshot & {
  /**
   * Bumped by every `browser_navigate`. There is one view for the whole
   * window and it outlives Session and Project switches, so the page the user
   * just left can still be emitting; the renderer keeps the id its own last
   * navigate answered with and drops everything stamped otherwise.
   */
  navigationId: number;
};

/**
 * What the user marked in design mode lives in `@pigui/core`: the shapes
 * outgrew the wire — the renderer assembles a payload out of them and core's
 * `formatBrowserAnnotationPrompt` renders it for Pi. They are re-exported here
 * so main, the annotation preload and the renderer keep reading one protocol
 * module.
 *
 * Type-only on purpose. The annotation preload reaches this module (through
 * `electron/browser-annotation.ts`) and has to stay self-contained, so nothing
 * here may become a runtime import (PRD S2 implementation constraint 6).
 */
export type { BrowserAnnotationElement, BrowserAnnotationViewport };

export type BrowserEvent =
  | ({ type: "did-navigate" } & BrowserViewState)
  | {
      type: "annotations-changed";
      navigationId: number;
      annotations: BrowserAnnotationElement[];
      /**
       * The page's own viewport as it measured those rects, and null for the
       * reset a fresh document announces — it has measured nothing yet.
       */
      viewport: BrowserAnnotationViewport | null;
    }
  /** Design mode turned off inside the page (Esc), so the toolbar can follow. */
  | { type: "design-mode-changed"; navigationId: number; enabled: boolean }
  | {
      type: "did-fail-load";
      navigationId: number;
      url: string;
      errorCode: number;
      errorDescription: string;
    };

export const browserEventChannel = "pigui:browser-event";
