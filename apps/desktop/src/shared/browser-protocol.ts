/**
 * Wire contract for the embedded browser surface.
 *
 * The view is a native `WebContentsView` owned by the Electron main process —
 * it never reaches the utilityProcess backend, so the embedded page can never
 * touch the Runtime Gateway MessagePort (ADR-0013). Main, preload and the
 * renderer share only the shapes below.
 */

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
 * One element the user marked in design mode. Produced in the embedded page's
 * isolated world, validated in main, read by the renderer.
 *
 * There is no `reactName`: the isolated world shares the page's DOM but not
 * its JS wrappers, so React's `__reactFiber$` expando is simply not there
 * (PRD S2 implementation constraint 1). `source` is the best-effort stand-in,
 * read from whatever `data-*` attributes the dev server stamped.
 */
export type BrowserAnnotationElement = {
  /** 1-based; the number the marker shows in the page and on the screenshot. */
  index: number;
  selector: string;
  tag: string;
  text?: string;
  /** Viewport-relative, as measured when the element was marked. */
  rect: BrowserViewRect;
  source?: { file: string; line: number; column?: number };
  comment?: string;
};

export type BrowserEvent =
  | ({ type: "did-navigate" } & BrowserViewState)
  | {
      type: "annotations-changed";
      navigationId: number;
      annotations: BrowserAnnotationElement[];
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
