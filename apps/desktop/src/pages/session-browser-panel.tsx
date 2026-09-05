import { useCallback, useEffect, useRef, useState } from "react";
import { formatBrowserAnnotationPrompt } from "@pigui/core";
import {
  activateBrowserTab,
  attachBrowserSession,
  browserBack,
  browserForward,
  captureBrowser,
  captureBrowserAnnotation,
  clearBrowserAnnotations,
  closeBrowserTab,
  hideBrowserSession,
  navigateBrowser,
  openBrowserTab,
  openBrowserUrlExternally,
  reloadBrowser,
  setBrowserBounds,
  setBrowserDesignMode,
  setBrowserVisible,
  subscribeBrowserEvents,
} from "@/entities/browser/browser-client";
import {
  getProjectBrowserTabs,
  rememberProjectBrowserTabs,
} from "@/entities/browser/browser-url-memory";
import { injectIntoComposer } from "@/entities/session/composer-injections";
import { isElectronRuntime } from "@/shared/runtime";
import type {
  BrowserSessionState,
  BrowserTabState,
  BrowserViewRect,
} from "@/shared/browser-protocol";
import {
  BrowserSurface,
  type BrowserSurfaceState,
} from "@/shared/ui/browser/browser-surface";
import { useBrowserViewBounds } from "@/shared/ui/browser/use-browser-view-bounds";
import { useOverlayPresence } from "@/shared/ui/browser/use-overlay-presence";

type Props = {
  projectId: string;
  sessionId: string;
  docked: boolean;
  onInstancesChange?: (tabs: BrowserTabState[]) => void;
};

/** Key the renderer lifetime while main keeps each Session's native pages alive. */
export function SessionBrowserPanel(props: Props) {
  return (
    <BrowserSessionContent
      key={`${props.projectId}:${props.sessionId}:${props.docked}`}
      {...props}
    />
  );
}

function BrowserSessionContent({
  projectId,
  sessionId,
  docked,
  onInstancesChange,
}: Props) {
  const [group, setGroup] = useState<BrowserSessionState | null>(null);
  const groupRef = useRef<BrowserSessionState | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, string | null>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{
    tabId: string;
    image: string;
  } | null>(null);
  const [sendingTabId, setSendingTabId] = useState<string | null>(null);
  const alive = useRef(false);
  // Every context change invalidates pending captures, even if the user switches back.
  const contextVersion = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const instancesCallback = useRef(onInstancesChange);
  instancesCallback.current = onInstancesChange;
  const available = isElectronRuntime() && docked;

  const applyGroup = useCallback((next: BrowserSessionState) => {
    if (!alive.current) return;
    const previous = groupRef.current;
    // IPC replies can arrive after a newer event for the same document.
    next = {
      ...next,
      tabs: next.tabs.map((tab) => {
        const latest = previous?.tabs.find((item) => item.tabId === tab.tabId);
        return latest && latest.revision > tab.revision ? latest : tab;
      }),
    };
    setDrafts((drafts) => {
      const updated: Record<string, string> = {};
      for (const tab of next.tabs) {
        const old = previous?.tabs.find((item) => item.tabId === tab.tabId);
        updated[tab.tabId] =
          old?.url === tab.url ? (drafts[tab.tabId] ?? tab.url) : tab.url;
      }
      if (!next.tabs.length) updated.empty = drafts.empty ?? "";
      return updated;
    });
    groupRef.current = next;
    setGroup(next);
  }, []);

  useEffect(() => {
    if (!available) return;
    alive.current = true;
    // Main can publish while attach restores a fast page, before its reply arrives.
    const early = new Map<string, BrowserTabState>();
    const unsubscribe = subscribeBrowserEvents(({ tab }) => {
      if (tab.sessionId !== sessionId || !alive.current) return;
      const current = groupRef.current;
      if (!current) {
        early.set(tab.tabId, tab);
        return;
      }
      const previous = current.tabs.find((item) => item.tabId === tab.tabId);
      if (!previous || tab.revision < previous.revision) return;
      applyGroup({
        ...current,
        tabs: current.tabs.map((item) =>
          item.tabId === tab.tabId ? tab : item,
        ),
      });
    });
    void attachBrowserSession(sessionId, getProjectBrowserTabs(projectId))
      .then((restored) => {
        applyGroup({
          ...restored,
          tabs: restored.tabs.map((tab) =>
            (early.get(tab.tabId)?.revision ?? -1) > tab.revision
              ? early.get(tab.tabId)!
              : tab,
          ),
        });
      })
      .catch((error) => {
        if (alive.current) setActionError(errorMessage(error));
      });
    return () => {
      alive.current = false;
      contextVersion.current += 1;
      unsubscribe();
      void hideBrowserSession(sessionId).catch(() => {});
    };
  }, [applyGroup, available, projectId, sessionId]);

  useEffect(() => {
    if (!group) return;
    rememberProjectBrowserTabs(projectId, {
      tabs: group.tabs.map((tab) => tab.url),
      activeIndex: group.tabs.findIndex(
        (tab) => tab.tabId === group.activeTabId,
      ),
    });
    instancesCallback.current?.(group.tabs);
  }, [group, projectId]);

  const active =
    group?.tabs.find((tab) => tab.tabId === group.activeTabId) ?? null;
  const tabId = active?.tabId ?? null;
  const target = useCallback(
    () => (tabId ? { sessionId, tabId } : null),
    [sessionId, tabId],
  );
  const state: BrowserSurfaceState = !docked
    ? { kind: "narrow" }
    : !isElectronRuntime()
      ? { kind: "unsupported" }
      : active?.error
        ? { kind: "error", message: active.error }
        : active?.url
          ? { kind: "live" }
          : { kind: "empty" };
  const pushBounds = useCallback(
    (rect: BrowserViewRect) => {
      const page = target();
      if (page) void setBrowserBounds(page, rect).catch(() => {});
    },
    [target],
  );
  useBrowserViewBounds(
    viewportRef,
    pushBounds,
    available && state.kind === "live",
  );
  const overlayOpen = useOverlayPresence(available && state.kind === "live");
  const currentSnapshot = snapshot?.tabId === tabId ? snapshot.image : null;

  useEffect(() => {
    setSnapshot(null);
    const page = target();
    if (!available || state.kind !== "live" || !overlayOpen || !page) return;
    let cancelled = false;
    void captureBrowser(page)
      .then((image) => {
        if (!cancelled && image) setSnapshot({ tabId: page.tabId, image });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [available, overlayOpen, state.kind, target]);

  useEffect(() => {
    const page = target();
    if (!available || !page) return;
    void setBrowserVisible(
      page,
      state.kind === "live" && !currentSnapshot,
    ).catch(() => {});
    return () => {
      void setBrowserVisible(page, false).catch(() => {});
    };
  }, [available, currentSnapshot, state.kind, target]);

  const changeTabs = async (action: () => Promise<BrowserSessionState>) => {
    contextVersion.current += 1;
    setActionError(null);
    try {
      applyGroup(await action());
    } catch (error) {
      if (alive.current) setActionError(errorMessage(error));
    }
  };
  const runPageCommand = (action: () => Promise<unknown>) => {
    void action().catch((error) => {
      if (alive.current) setActionError(errorMessage(error));
    });
  };
  const submitAddress = async (url: string) => {
    if (!available || !url.trim()) return;
    const version = ++contextVersion.current;
    setActionError(null);
    let page = target();
    try {
      if (!page) {
        const opened = await openBrowserTab(sessionId);
        if (!alive.current || contextVersion.current !== version) return;
        applyGroup(opened);
        page = opened.activeTabId
          ? { sessionId, tabId: opened.activeTabId }
          : null;
      }
      if (!page) return;
      const current = groupRef.current;
      if (current)
        applyGroup({
          ...current,
          tabs: current.tabs.map((tab) =>
            tab.tabId === page!.tabId
              ? { ...tab, annotations: [], viewport: null, error: null }
              : tab,
          ),
        });
      setNotices((current) => ({ ...current, [page!.tabId]: null }));
      await navigateBrowser(page, url);
    } catch (error) {
      if (alive.current && contextVersion.current === version)
        setActionError(errorMessage(error));
    }
  };
  const sendToComposer = async () => {
    if (!active?.annotations.length || !active.viewport || sendingTabId) return;
    const page = { sessionId, tabId: active.tabId };
    const version = contextVersion.current;
    const navigationId = active.navigationId;
    setSendingTabId(page.tabId);
    setNotices((current) => ({ ...current, [page.tabId]: null }));
    try {
      const capture = await captureBrowserAnnotation(page).catch(() => null);
      const current = groupRef.current;
      const latest = current?.tabs.find((tab) => tab.tabId === page.tabId);
      if (
        !alive.current ||
        version !== contextVersion.current ||
        current?.activeTabId !== page.tabId ||
        latest?.navigationId !== navigationId ||
        latest.url !== active.url
      )
        return;
      const image = capture?.image ?? null;
      const delivered = injectIntoComposer({
        sessionId,
        text: formatBrowserAnnotationPrompt({
          url: capture?.url || active.url,
          viewport: capture?.viewport ?? active.viewport,
          elements: capture?.annotations ?? active.annotations,
          capturedAt: new Date().toISOString(),
          screenshot: image !== null,
        }),
        files: image ? [pngFileFromDataUrl(image)] : [],
      });
      setNotices((current) => ({
        ...current,
        [page.tabId]: !delivered
          ? "No composer is open for this Session, so nothing was sent. The marks are still on the page."
          : image
            ? null
            : "Sent without a screenshot — the page could not be photographed.",
      }));
    } finally {
      if (alive.current) setSendingTabId(null);
    }
  };

  const addressKey = tabId ?? "empty";
  return (
    <BrowserSurface
      tabs={(group?.tabs ?? []).map((tab, index) => ({
        id: tab.tabId,
        label: `Browser ${index + 1}`,
        hint: tab.title ? `${tab.title} — ${tab.url}` : tab.url,
      }))}
      activeTabId={tabId}
      onActivateTab={(tabId) =>
        void changeTabs(() => activateBrowserTab({ sessionId, tabId }))
      }
      onAddTab={() => void changeTabs(() => openBrowserTab(sessionId))}
      onCloseTab={(tabId) =>
        void changeTabs(() => closeBrowserTab({ sessionId, tabId }))
      }
      address={drafts[addressKey] ?? active?.url ?? ""}
      annotationCount={active?.annotations.length ?? 0}
      canGoBack={active?.canGoBack ?? false}
      canGoForward={active?.canGoForward ?? false}
      designMode={active?.designMode ?? false}
      isLoading={active?.loading ?? false}
      isSending={sendingTabId === tabId && tabId !== null}
      notice={actionError ?? notices[addressKey]}
      snapshot={currentSnapshot}
      state={state}
      viewportRef={viewportRef}
      onAddressChange={(address) =>
        setDrafts((current) => ({ ...current, [addressKey]: address }))
      }
      onAddressSubmit={(url) => void submitAddress(url)}
      onBack={() => {
        if (active)
          runPageCommand(() => browserBack({ sessionId, tabId: active.tabId }));
      }}
      onForward={() => {
        if (active)
          runPageCommand(() =>
            browserForward({ sessionId, tabId: active.tabId }),
          );
      }}
      onReload={() => {
        if (active?.error) {
          void submitAddress(active.url);
          return;
        }
        if (active)
          runPageCommand(() =>
            reloadBrowser({ sessionId, tabId: active.tabId }),
          );
      }}
      onOpenExternal={() => {
        if (active) runPageCommand(() => openBrowserUrlExternally(active.url));
      }}
      onClearAnnotations={() => {
        if (active)
          runPageCommand(() =>
            clearBrowserAnnotations({ sessionId, tabId: active.tabId }),
          );
      }}
      onDesignModeChange={(enabled) => {
        if (active)
          runPageCommand(() =>
            setBrowserDesignMode({ sessionId, tabId: active.tabId }, enabled),
          );
      }}
      onSendToComposer={() =>
        void sendToComposer().catch((error) => {
          if (alive.current) setActionError(errorMessage(error));
        })
      }
    />
  );
}

function pngFileFromDataUrl(dataUrl: string) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new File([bytes], "browser-annotations.png", { type: "image/png" });
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The page could not be opened.";
}
