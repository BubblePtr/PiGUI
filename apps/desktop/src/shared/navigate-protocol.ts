/**
 * Main → renderer navigation requests (macOS menu, and any later host entry).
 *
 * Payload stays a path string so the renderer can hand it to the router.
 * Main never touches location.hash or executeJavaScript.
 */

export const navigateRequestChannel = "pigui:navigate";

export type NavigateRequest = {
  /** Route path, or "." to stay on the current route (dialogs live in search). */
  to: string;
  /** Merged into the current search params, e.g. { settings: "about" }. */
  search?: Record<string, unknown>;
};
