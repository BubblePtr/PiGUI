import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatBrowserAnnotationPrompt,
  type BrowserAnnotationElement,
  type BrowserAnnotationViewport,
} from "@pigui/core";
import {
  browserBack,
  browserForward,
  captureBrowser,
  captureBrowserAnnotation,
  clearBrowserAnnotations,
  navigateBrowser,
  openBrowserUrlExternally,
  reloadBrowser,
  setBrowserBounds,
  setBrowserDesignMode,
  setBrowserVisible,
  subscribeBrowserEvents,
} from "@/entities/browser/browser-client";
import {
  getProjectBrowserUrl,
  rememberProjectBrowserUrl,
} from "@/entities/browser/browser-url-memory";
import { injectIntoComposer } from "@/entities/session/composer-injections";
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
  const [designMode, setDesignMode] = useState(false);
  // The marks live in the page's own overlay; this side keeps the copy the
  // page reports, with the viewport it measured them in. One state rather than
  // two, because marks without that viewport cannot be turned into a payload.
  const [marks, setMarks] = useState<{
    annotations: BrowserAnnotationElement[];
    viewport: BrowserAnnotationViewport;
  } | null>(null);
  // A send takes a round trip through the page and back; the toolbar says so,
  // and a second one must not start meanwhile.
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // The address bar is an input the user can type in without navigating, so
  // what it holds is not necessarily what is loaded. The payload has to name
  // the page the marks are actually on.
  const loadedUrlRef = useRef("");
  // Null means "nothing of mine is loaded": drop every event until this
  // component's own navigate answers with an id.
  const acceptedNavigationRef = useRef<number | null>(null);
  const available = isElectronRuntime() && docked;

  const applyNavigation = useCallback(
    (view: BrowserViewState) => {
      setLoadError(null);
      setHasPage(true);
      setAddress(view.url);
      loadedUrlRef.current = view.url;
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
    // The page this switch brings up starts unmarked and out of design mode.
    // Main has to hear it too: it re-applies design mode to every document
    // that reports in, so a reset kept to this side would leave the page
    // marking while the toolbar says it is not.
    setDesignMode(false);
    setMarks(null);
    setNotice(null);
    void setBrowserDesignMode(false).catch(() => {});

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
        case "annotations-changed":
          // A fresh document announces itself with no marks and no viewport;
          // so does clearing them. Either way there is nothing to send.
          setMarks(
            event.viewport && event.annotations.length
              ? { annotations: event.annotations, viewport: event.viewport }
              : null,
          );
          break;
        case "design-mode-changed":
          // The page can leave design mode by itself (Escape), and the toolbar
          // has to stop claiming otherwise.
          setDesignMode(event.enabled);
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
  // the view without discarding the page. Design mode and the marks go with
  // it: the page outlives this component, and one left marking would swallow
  // every click with no toolbar in sight.
  useEffect(() => {
    if (!available) {
      return;
    }

    return () => {
      void setBrowserVisible(false).catch(() => {});
      void setBrowserDesignMode(false).catch(() => {});
      void clearBrowserAnnotations().catch(() => {});
    };
  }, [available]);

  const submitAddress = (next: string) => {
    if (!next.trim()) {
      return;
    }

    setLoadError(null);
    // The marks belong to the page being left. The new document does announce
    // itself, but that announcement is stamped with a navigation id this
    // component has not accepted yet, so it can never do the clearing.
    setMarks(null);
    setNotice(null);
    // Optimistic: the placeholder has to exist (and push its bounds) before the
    // page paints, or the native view shows up at the previous rect first.
    setHasPage(true);
    void navigateBrowser(next)
      .then(acceptNavigation)
      .catch((error: unknown) => {
        setLoadError(errorMessage(error));
      });
  };

  /**
   * The one thing design mode is for: the marks and a screenshot of them land
   * in this Session's composer as a draft the user can still edit, so the
   * choice between sending, queueing and steering stays theirs (PRD decision
   * 5, and "Send now" was ruled out).
   *
   * The payload is built from what the capture answers with, not from what
   * this component happens to be holding: main has the page settle its overlay
   * and re-measure for the shot, which is also the moment a comment still
   * being typed is committed. Only if that whole exchange fails does the last
   * event this side saw stand in for it.
   */
  const sendToComposer = async () => {
    if (!marks || sending) {
      return;
    }

    setSending(true);
    setNotice(null);

    const capture = await captureBrowserAnnotation().catch(() => null);
    const image = capture?.image ?? null;
    const delivered = injectIntoComposer({
      sessionId,
      text: formatBrowserAnnotationPrompt({
        url: capture?.url || loadedUrlRef.current,
        viewport: capture?.viewport ?? marks.viewport,
        elements: capture?.annotations.length ? capture.annotations : marks.annotations,
        capturedAt: new Date().toISOString(),
        screenshot: image !== null,
      }),
      files: image ? [pngFileFromDataUrl(image)] : [],
    });

    // The marks stay on the page either way, so every one of these leaves the
    // user able to try again rather than mark the page a second time.
    setNotice(
      !delivered
        ? "No composer is open for this Session, so nothing was sent. The marks are still on the page."
        : image
          ? null
          : "Sent without a screenshot — the page could not be photographed.",
    );
    setSending(false);
  };

  return (
    <BrowserSurface
      address={address}
      annotationCount={marks?.annotations.length ?? 0}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      designMode={designMode}
      isSending={sending}
      notice={notice}
      snapshot={snapshot}
      state={state}
      viewportRef={viewportRef}
      onAddressChange={setAddress}
      onAddressSubmit={submitAddress}
      onBack={() => void browserBack().catch(() => {})}
      onClearAnnotations={() => void clearBrowserAnnotations().catch(() => {})}
      onDesignModeChange={(enabled) => {
        setDesignMode(enabled);
        void setBrowserDesignMode(enabled).catch(() => {});
      }}
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
      onSendToComposer={() => void sendToComposer().catch(() => {})}
    />
  );
}

/**
 * The capture comes back as a data URL and the composer's attachment path
 * wants a `File` — that path is what gives the screenshot its drawer preview,
 * its size check and its base64 encoding at submit.
 */
function pngFileFromDataUrl(dataUrl: string) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], "browser-annotations.png", { type: "image/png" });
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
