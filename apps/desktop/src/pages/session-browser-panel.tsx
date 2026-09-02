import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserBack,
  browserForward,
  captureBrowser,
  navigateBrowser,
  openBrowserUrlExternally,
  reloadBrowser,
  setBrowserBounds,
  setBrowserVisible,
  subscribeBrowserEvents,
} from "@/entities/browser/browser-client";
import {
  getProjectBrowserUrl,
  rememberProjectBrowserUrl,
} from "@/entities/browser/browser-url-memory";
import { isElectronRuntime } from "@/shared/runtime";
import type { BrowserViewRect, BrowserViewState } from "@/shared/browser-protocol";
import {
  BrowserSurface,
  type BrowserSurfaceState,
} from "@/shared/ui/browser/browser-surface";
import { useBrowserViewBounds } from "@/shared/ui/browser/use-browser-view-bounds";
import { useOverlayPresence } from "@/shared/ui/browser/use-overlay-presence";

/**
 * Browser surface content: drives the one native `WebContentsView` the main
 * process owns for this window.
 *
 * Two consequences of that single view shape run through this component. Only
 * the instance that can actually host it — docked, in Electron — is allowed to
 * send it any command, because the Sheet fallback below the dock breakpoint
 * outlives the docked instance across a resize and would otherwise hide the
 * view its replacement just showed. And because the view survives Project and
 * Session switches, its events are matched against the navigation id of this
 * component's own last navigate; anything older belongs to a page the user has
 * already left.
 *
 * The URL memory is per Project, because a dev server belongs to a Project,
 * not to one Session (PRD decision 2).
 */
export function SessionBrowserPanel({
  projectId,
  sessionId,
  docked,
}: {
  projectId: string;
  sessionId: string;
  docked: boolean;
}) {
  const [address, setAddress] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasPage, setHasPage] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Null means "nothing of mine is loaded": drop every event until this
  // component's own navigate answers with an id.
  const acceptedNavigationRef = useRef<number | null>(null);
  const available = isElectronRuntime() && docked;

  const applyNavigation = useCallback(
    (view: BrowserViewState) => {
      setLoadError(null);
      setHasPage(true);
      setAddress(view.url);
      setCanGoBack(view.canGoBack);
      setCanGoForward(view.canGoForward);
      // Redirects mean the typed text is not what loaded; memory follows the
      // page, not the keystrokes.
      rememberProjectBrowserUrl(projectId, view.url);
    },
    [projectId],
  );
  const acceptNavigation = useCallback(
    (view: BrowserViewState) => {
      acceptedNavigationRef.current = view.navigationId;
      applyNavigation(view);
    },
    [applyNavigation],
  );

  // Bring out the Project's last preview, or fall back to the empty state.
  // Switching Sessions reuses this component, so `sessionId` has to drive the
  // restore. The view is never disposed here: it keeps the previous page
  // loaded but hidden, which is what makes coming back instant (PRD section 6).
  useEffect(() => {
    if (!available) {
      return;
    }

    const remembered = getProjectBrowserUrl(projectId);

    setLoadError(null);
    setAddress(remembered ?? "");
    setHasPage(Boolean(remembered));

    if (!remembered) {
      acceptedNavigationRef.current = null;
      setCanGoBack(false);
      setCanGoForward(false);
      return;
    }

    void navigateBrowser(remembered)
      .then(acceptNavigation)
      .catch((error: unknown) => {
        setLoadError(errorMessage(error));
      });
  }, [acceptNavigation, available, projectId, sessionId]);

  useEffect(() => {
    if (!available) {
      return;
    }

    return subscribeBrowserEvents((event) => {
      if (event.navigationId !== acceptedNavigationRef.current) {
        return;
      }

      switch (event.type) {
        case "did-navigate":
          applyNavigation(event);
          break;
        case "did-fail-load":
          setLoadError(event.errorDescription || `Load failed (${event.errorCode}).`);
          break;
      }
    });
  }, [applyNavigation, available]);

  const pushBounds = useCallback((rect: BrowserViewRect) => {
    void setBrowserBounds(rect).catch(() => {});
  }, []);
  const state = surfaceState({ docked, hasPage, loadError });

  useBrowserViewBounds(viewportRef, pushBounds, state.kind === "live");

  // A native view paints above every DOM layer, so any open overlay — the
  // inspector rail's own tooltips most of all, which open right against it —
  // would be covered. While one is up the page is replaced by a still of
  // itself and the view steps aside.
  const overlayOpen = useOverlayPresence(available && state.kind === "live");

  useEffect(() => {
    if (!available || state.kind !== "live" || !overlayOpen) {
      setSnapshot(null);
      return;
    }

    let overlayGone = false;

    void captureBrowser()
      .then((dataUrl) => {
        // The overlay can close while the capture is in flight. Showing the
        // still now would freeze the page over a view that is already right,
        // and the cleanup below is what makes that ordering safe: a late
        // still from a previous open/close cycle lands after its own cleanup.
        if (!overlayGone && dataUrl) {
          setSnapshot(dataUrl);
        }
      })
      .catch(() => {});

    return () => {
      overlayGone = true;
    };
  }, [available, overlayOpen, state.kind]);

  // Visibility follows the surface state, so the error and empty states hide
  // the view without a second code path asking for it — and so does the still
  // standing in for it.
  useEffect(() => {
    if (!available) {
      return;
    }

    void setBrowserVisible(state.kind === "live" && !snapshot).catch(() => {});
  }, [available, snapshot, state.kind]);

  // Leaving the surface (other surface, inspector closed, Session switch) hides
  // the view without discarding the page.
  useEffect(() => {
    if (!available) {
      return;
    }

    return () => {
      void setBrowserVisible(false).catch(() => {});
    };
  }, [available]);

  const submitAddress = (next: string) => {
    if (!next.trim()) {
      return;
    }

    setLoadError(null);
    // Optimistic: the placeholder has to exist (and push its bounds) before the
    // page paints, or the native view shows up at the previous rect first.
    setHasPage(true);
    void navigateBrowser(next)
      .then(acceptNavigation)
      .catch((error: unknown) => {
        setLoadError(errorMessage(error));
      });
  };

  return (
    <BrowserSurface
      address={address}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      snapshot={snapshot}
      state={state}
      viewportRef={viewportRef}
      onAddressChange={setAddress}
      onAddressSubmit={submitAddress}
      onBack={() => void browserBack().catch(() => {})}
      onForward={() => void browserForward().catch(() => {})}
      onOpenExternal={() => void openBrowserUrlExternally(address).catch(() => {})}
      onReload={() => {
        // A failed load left the view on Chromium's error page, so there is
        // nothing to reload — the address has to be requested again.
        if (loadError) {
          submitAddress(address);
          return;
        }

        void reloadBrowser().catch(() => {});
      }}
    />
  );
}

function surfaceState(input: {
  docked: boolean;
  hasPage: boolean;
  loadError: string | null;
}): BrowserSurfaceState {
  // Below the dock breakpoint the inspector is a Dialog portal; a native view
  // would paint over its overlay, so the surface stays purely DOM there.
  if (!input.docked) {
    return { kind: "narrow" };
  }

  if (!isElectronRuntime()) {
    return { kind: "unsupported" };
  }

  if (input.loadError) {
    return { kind: "error", message: input.loadError };
  }

  return input.hasPage ? { kind: "live" } : { kind: "empty" };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The page could not be opened.";
}
