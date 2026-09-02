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
 * to, so no caller ever has to know whether one already exists. Nor is there a
 * dispose: the view outlives every Project and Session switch (PRD section 6)
 * and only the window closing takes it down, which main does directly.
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

/**
 * Design mode runs in the embedded page's isolated world, so this only states
 * the intent: main relays it to the annotation preload, which owns the overlay.
 * What the user marked comes back as `annotations-changed`, never as an answer
 * to these calls.
 */
export function setBrowserDesignMode(enabled: boolean) {
  return invoke<null>("browser_set_design_mode", { enabled });
}

export function clearBrowserAnnotations() {
  return invoke<null>("browser_clear_annotations");
}

/** Still of the page, so a DOM overlay can be shown without the native view
 *  covering it. Null when there is no view to photograph. */
export function captureBrowser() {
  return invoke<string | null>("browser_capture");
}

/**
 * The same page, but sized for a prompt rather than for the placeholder: main
 * brings a HiDPI capture back down to the panel's CSS width, keeping the PNG
 * under the 8 MiB an image attachment may weigh.
 */
export function captureBrowserAnnotation() {
  return invoke<string | null>("browser_capture_annotation");
}

export function openBrowserUrlExternally(url: string) {
  return invoke<null>("browser_open_external", { url });
}

export function subscribeBrowserEvents(listener: (event: BrowserEvent) => void) {
  return onBrowserEvent(listener);
}
