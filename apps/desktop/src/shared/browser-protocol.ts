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
   * Bumped by every `browser_navigate` and `browser_dispose`. There is one
   * view for the whole window, so a Session or Project switch can still have
   * the previous page's events in flight; the renderer keeps the id its own
   * last navigate answered with and drops everything stamped otherwise.
   */
  navigationId: number;
};

export type BrowserEvent =
  | ({ type: "did-navigate" } & BrowserViewState)
  | {
      type: "did-fail-load";
      navigationId: number;
      url: string;
      errorCode: number;
      errorDescription: string;
    };

export const browserEventChannel = "pigui:browser-event";
