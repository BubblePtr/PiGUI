import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserBack,
  browserForward,
  disposeBrowser,
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

/**
 * Browser surface content: drives the one native `WebContentsView` the main
 * process owns for this window.
 *
 * There is a single view per window, so the panel is the only place allowed to
 * navigate it. The URL memory is per Project, because a dev server belongs to
 * a Project, not to one Session (PRD decision 2).
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const available = isElectronRuntime() && docked;
  // `browser_navigate` answers with the view's state, which is the only signal
  // when it short-circuits an already-loaded URL and no event follows.
  const applyViewState = useCallback((view: BrowserViewState) => {
    setAddress(view.url);
    setCanGoBack(view.canGoBack);
    setCanGoForward(view.canGoForward);
  }, []);

  // Bring out the Project's last preview, or clear the view so another
  // Project's page is not sitting behind the empty state. Switching Sessions
  // reuses this component, so `sessionId` has to drive the restore.
  useEffect(() => {
    if (!available) {
      return;
    }

    const remembered = getProjectBrowserUrl(projectId);

    setLoadError(null);
    setAddress(remembered ?? "");
    setHasPage(Boolean(remembered));

    if (!remembered) {
      setCanGoBack(false);
      setCanGoForward(false);
      void disposeBrowser().catch(() => {});
      return;
    }

    void navigateBrowser(remembered)
      .then(applyViewState)
      .catch((error: unknown) => {
        setLoadError(errorMessage(error));
      });
  }, [applyViewState, available, projectId, sessionId]);

  // Leaving the surface (other surface, inspector closed, Session switch) hides
  // the view without discarding the page, so coming back is instant.
  useEffect(() => {
    if (!isElectronRuntime()) {
      return;
    }

    return () => {
      void setBrowserVisible(false).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!available) {
      return;
    }

    return subscribeBrowserEvents((event) => {
      switch (event.type) {
        case "did-navigate":
          setLoadError(null);
          setHasPage(true);
          applyViewState(event);
          // Redirects and in-page navigation mean the typed text is not what
          // loaded; memory follows the page, not the keystrokes.
          rememberProjectBrowserUrl(projectId, event.url);
          break;
        case "did-fail-load":
          setLoadError(event.errorDescription || `Load failed (${event.errorCode}).`);
          break;
      }
    });
  }, [applyViewState, available, projectId]);

  const pushBounds = useCallback((rect: BrowserViewRect) => {
    void setBrowserBounds(rect).catch(() => {});
  }, []);
  const state = surfaceState({ docked, hasPage, loadError });

  useBrowserViewBounds(viewportRef, pushBounds, state.kind === "live");

  // Visibility follows the surface state, so the narrow and error states hide
  // the native view without a second code path asking for it.
  useEffect(() => {
    if (!isElectronRuntime()) {
      return;
    }

    void setBrowserVisible(state.kind === "live").catch(() => {});
  }, [state.kind]);

  const submitAddress = (next: string) => {
    if (!next.trim()) {
      return;
    }

    setLoadError(null);
    // Optimistic: the placeholder has to exist (and push its bounds) before the
    // page paints, or the native view shows up at the previous rect first.
    setHasPage(true);
    void navigateBrowser(next)
      .then(applyViewState)
      .catch((error: unknown) => {
        setLoadError(errorMessage(error));
      });
  };

  return (
    <BrowserSurface
      address={address}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      state={state}
      viewportRef={viewportRef}
      onAddressChange={setAddress}
      onAddressSubmit={submitAddress}
      onBack={() => void browserBack().catch(() => {})}
      onForward={() => void browserForward().catch(() => {})}
      onOpenExternal={() => void openBrowserUrlExternally(address).catch(() => {})}
      onReload={() => {
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
