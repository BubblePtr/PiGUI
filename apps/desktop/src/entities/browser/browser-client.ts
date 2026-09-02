import { invoke, onBrowserEvent } from "@/shared/runtime";
import type {
  BrowserEvent,
  BrowserViewRect,
  BrowserViewState,
} from "@/shared/browser-protocol";

/**
 * Renderer client for the embedded browser view. Unlike every other surface,
 * the peer here is the Electron main process, not the utilityProcess backend:
 * the view is a native child of the window and the embedded page must never
 * reach the Runtime Gateway (ADR-0013).
 *
 * There is no `browser_open`: `browser_navigate` creates the view when it has
 * to, so no caller ever has to know whether one already exists.
 */
export function navigateBrowser(url: string) {
  return invoke<BrowserViewState>("browser_navigate", { url });
}

export function browserBack() {
  return invoke<BrowserViewState | null>("browser_back");
}

export function browserForward() {
  return invoke<BrowserViewState | null>("browser_forward");
}

export function reloadBrowser() {
  return invoke<BrowserViewState | null>("browser_reload");
}

export function setBrowserBounds(rect: BrowserViewRect) {
  return invoke<BrowserViewState | null>("browser_set_bounds", { rect });
}

export function setBrowserVisible(visible: boolean) {
  return invoke<BrowserViewState | null>("browser_set_visible", { visible });
}

export function openBrowserUrlExternally(url: string) {
  return invoke<null>("browser_open_external", { url });
}

/** Drops the view so another Project's page is not kept behind an empty state. */
export function disposeBrowser() {
  return invoke<null>("browser_dispose");
}

export function subscribeBrowserEvents(listener: (event: BrowserEvent) => void) {
  return onBrowserEvent(listener);
}
