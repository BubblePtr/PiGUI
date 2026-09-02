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

export type BrowserViewState = {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type BrowserEvent =
  | ({ type: "did-navigate" } & BrowserViewState)
  | {
      type: "did-fail-load";
      url: string;
      errorCode: number;
      errorDescription: string;
    };

export const browserEventChannel = "pigui:browser-event";
