import { useRouter, useRouterState } from "@tanstack/react-router";
import { AppLayout } from "@heroui-pro/react/app-layout";
import { Sidebar } from "@heroui-pro/react/sidebar";
import { BarChart3, Circle, ListTree, LoaderCircle, Plus, Settings } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ensureSessionDraft,
  hasSessionDraft,
  subscribeSessionDrafts,
} from "@/entities/session/session-drafts";
import {
  createSessionProjection,
  getSessionProjectionListItems,
  type SessionProjection,
  type SessionProjectionListItem,
} from "@/entities/session/session-projection";

type AppFrameProps = {
  sidebar?: ReactNode;
  toolbarActions?: ReactNode;
  sessionProjections?: SessionProjection[];
  selectedSessionId?: string | null;
  onSelectedSessionIdChange?: (sessionId: string | null) => void;
  children: ReactNode;
};

const sidebarProject = {
  id: "pig",
  name: "Pig",
  route: "/projects/pig/sessions",
};

function createSidebarProjection({
  id,
  title,
  status,
  updatedAt,
  unreadResult = false,
  archivedAt = null,
  summary = {},
}: {
  id: string;
  title: string;
  status: SessionProjection["status"];
  updatedAt: string;
  unreadResult?: boolean;
  archivedAt?: string | null;
  summary?: Partial<SessionProjection["summary"]>;
}): SessionProjection {
  const projection = createSessionProjection({
    id,
    projectId: sidebarProject.id,
    initialPrompt: title,
    createdAt: "2026-06-26T08:00:00.000Z",
  });

  return {
    ...projection,
    status,
    creationStage: "accepted",
    checkout:
      status === "running"
        ? {
            mode: "foreground-local",
            root: "/Users/void/code/opensource/Pig",
            runtimeCwd: "/Users/void/code/opensource/Pig",
          }
        : projection.checkout,
    runtimeId: status === "running" ? `${id}-runtime` : projection.runtimeId,
    piSessionId: status === "running" ? `${id}-pi-session` : projection.piSessionId,
    runtimeEvents:
      status === "running"
        ? [
            {
              id: `${id}-runtime-event`,
              piSessionId: `${id}-pi-session`,
              kind: "message",
              role: "assistant",
              body: title,
              timestamp: updatedAt,
            },
          ]
        : [],
    unreadResult,
    archivedAt,
    summary: {
      ...projection.summary,
      ...summary,
    },
    updatedAt,
  };
}

export const defaultSidebarProjectSessionProjections: SessionProjection[] = [
  createSidebarProjection({
    id: "session-usage-review",
    title: "Usage evidence review",
    status: "completed",
    summary: {
      model: "gpt-5-codex",
      totalCostUsd: 0.042137,
      totalTokens: 18_420,
    },
    updatedAt: "2026-06-26T08:03:00.000Z",
  }),
  createSidebarProjection({
    id: "session-control-plane-shell",
    title: "Agent Workspace shell",
    status: "running",
    summary: {
      model: "gpt-5-codex",
      totalCostUsd: 0.042137,
      totalTokens: 18_420,
    },
    updatedAt: "2026-06-26T08:06:00.000Z",
  }),
  createSidebarProjection({
    id: "session-archived-checkout",
    title: "Archived checkout snapshot",
    status: "completed",
    archivedAt: "2026-06-26T08:05:00.000Z",
    updatedAt: "2026-06-26T08:05:00.000Z",
  }),
  createSidebarProjection({
    id: "session-analyze-boundary",
    title: "Trace boundary pass",
    status: "completed",
    unreadResult: true,
    summary: {
      model: "gpt-5-codex",
      totalCostUsd: 0.042137,
      totalTokens: 18_420,
    },
    updatedAt: "2026-06-26T08:02:00.000Z",
  }),
];

const traceUsageNavigationItems = [
  {
    label: "Trace",
    to: "/",
    icon: ListTree,
    isActive: (pathname: string) => pathname === "/" || pathname.startsWith("/sessions/"),
  },
  {
    label: "Usage",
    to: "/usage",
    icon: BarChart3,
    isActive: (pathname: string) => pathname === "/usage",
  },
] as const;

const systemNavigationItems = [
  {
    label: "Settings",
    to: "/setup",
    icon: Settings,
    isActive: (pathname: string) => pathname === "/setup",
  },
] as const;

const sidebarDefaultSize = "280px";
const sidebarMinSize = "240px";
const sidebarMaxSize = "360px";
const sidebarStyle = {
  "--sidebar-width": sidebarDefaultSize,
} as CSSProperties;

const titlebarHeight = "40px";
const titlebarHeaderStyle = {
  height: titlebarHeight,
  paddingBottom: "0px",
  paddingTop: "0px",
} as CSSProperties;
const titlebarControlStyle = {
  width: "28px",
  height: "28px",
} as CSSProperties;
const trafficWidth = "88px";
const chromeSafeLeft = "132px";
const sidebarAnimationMs = 220;

function getActiveTab(pathname: string) {
  if (pathname.startsWith("/projects/")) {
    return "Sessions";
  }

  if (pathname === "/" || pathname.startsWith("/sessions/")) {
    return "Trace";
  }

  if (pathname === "/usage") {
    return "Usage";
  }

  return "Settings";
}

function SidebarSessionGlyph({
  active,
  unread,
}: {
  active: boolean;
  unread: boolean;
}) {
  if (active) {
    return (
      <LoaderCircle
        aria-label="Active run"
        className="size-4 animate-spin text-primary"
      />
    );
  }

  if (unread) {
    return (
      <span
        aria-label="Unread result"
        className="size-2 rounded-full bg-primary"
        role="img"
      />
    );
  }

  return <Circle aria-hidden="true" className="size-2 fill-muted text-muted" />;
}

function DraftBadge() {
  return (
    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.625rem] font-medium leading-none text-primary">
      Draft
    </span>
  );
}

function ProjectNavigation({
  draftViewActive,
  pathname,
  selectedSessionId,
  sessions,
  onOpenSession,
  onNewSession,
}: {
  draftViewActive: boolean;
  pathname: string;
  selectedSessionId: string | null;
  sessions: SessionProjectionListItem[];
  onOpenSession: (sessionId: string) => void;
  onNewSession: (projectId: string) => void;
}) {
  const projectActive = pathname.startsWith("/projects/");
  const [hasDraft, setHasDraft] = useState(() => hasSessionDraft(sidebarProject.id));

  useEffect(
    () =>
      subscribeSessionDrafts(() => {
        setHasDraft(hasSessionDraft(sidebarProject.id));
      }),
    [],
  );

  return (
    <Sidebar.Group data-testid="sidebar-projects">
      <Sidebar.GroupLabel className="flex items-center gap-2 px-3 text-sm normal-case">
        <span className="min-w-0 flex-1 truncate">{sidebarProject.name}</span>
        {hasDraft ? <DraftBadge /> : null}
        <button
          aria-label={`New Session for ${sidebarProject.name}`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          type="button"
          onClick={() => onNewSession(sidebarProject.id)}
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </button>
      </Sidebar.GroupLabel>
      <Sidebar.Menu aria-label="Pig project sessions" showGuideLines={false}>
        <Sidebar.MenuItem
          id={`${sidebarProject.id}-new-session`}
          isCurrent={draftViewActive}
          textValue="New Session"
          onAction={() => onNewSession(sidebarProject.id)}
        >
          <Sidebar.MenuIcon>
            <Plus className="size-4" />
          </Sidebar.MenuIcon>
          <Sidebar.MenuLabel>New Session</Sidebar.MenuLabel>
          {hasDraft ? (
            <Sidebar.MenuActions className="ml-auto">
              <DraftBadge />
            </Sidebar.MenuActions>
          ) : null}
        </Sidebar.MenuItem>
        {sessions.map((session) => (
          <Sidebar.MenuItem
            key={session.id}
            id={session.id}
            isCurrent={!draftViewActive && projectActive && session.id === selectedSessionId}
            textValue={session.title}
            onAction={() => onOpenSession(session.id)}
          >
            <Sidebar.MenuIcon className="justify-center">
              <SidebarSessionGlyph active={session.active} unread={session.unread} />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel className="min-w-0">
              <span className="block truncate">{session.title}</span>
            </Sidebar.MenuLabel>
            <Sidebar.MenuActions className="ml-auto text-xs tabular-nums text-muted">
              {session.updatedAt.slice(11, 16)}
            </Sidebar.MenuActions>
          </Sidebar.MenuItem>
        ))}
      </Sidebar.Menu>
    </Sidebar.Group>
  );
}

function WorkspaceNavigation({
  draftViewActive,
  pathname,
  selectedSessionId,
  sessions,
  onOpenSession,
  onNewSession,
}: {
  draftViewActive: boolean;
  pathname: string;
  selectedSessionId: string | null;
  sessions: SessionProjectionListItem[];
  onOpenSession: (sessionId: string) => void;
  onNewSession: (projectId: string) => void;
}) {
  return (
    <Sidebar.Group
      className="min-h-0 flex-1 overflow-y-auto"
      data-testid="sidebar-workspace"
    >
      <Sidebar.GroupLabel className="px-3 text-sm normal-case">
        Workspace
      </Sidebar.GroupLabel>
      <ProjectNavigation
        draftViewActive={draftViewActive}
        pathname={pathname}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
        onOpenSession={onOpenSession}
        onNewSession={onNewSession}
      />
    </Sidebar.Group>
  );
}

function TraceUsageNavigation({ pathname }: { pathname: string }) {
  return (
    <Sidebar.Group>
      <Sidebar.Menu aria-label="Trace and usage navigation" showGuideLines={false}>
        {traceUsageNavigationItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);

          return (
            <Sidebar.MenuItem
              key={item.to}
              href={item.to}
              id={item.label}
              isCurrent={active}
              textValue={item.label}
            >
              <Sidebar.MenuIcon>
                <Icon className="size-4" />
              </Sidebar.MenuIcon>
              <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
            </Sidebar.MenuItem>
          );
        })}
      </Sidebar.Menu>
    </Sidebar.Group>
  );
}

function SystemNavigation({ pathname }: { pathname: string }) {
  return (
    <Sidebar.Group>
      <Sidebar.Menu aria-label="System navigation" showGuideLines={false}>
        {systemNavigationItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname);

          return (
            <Sidebar.MenuItem
              key={item.to}
              href={item.to}
              id={item.to}
              isCurrent={active}
              textValue={item.label}
            >
              <Sidebar.MenuIcon>
                <Icon className="size-4" />
              </Sidebar.MenuIcon>
              <Sidebar.MenuLabel>{item.label}</Sidebar.MenuLabel>
            </Sidebar.MenuItem>
          );
        })}
      </Sidebar.Menu>
    </Sidebar.Group>
  );
}

function SidebarPanelContent({
  draftViewActive,
  pathname,
  selectedSessionId,
  sessions,
  onOpenSession,
  onNewSession,
}: {
  draftViewActive: boolean;
  pathname: string;
  selectedSessionId: string | null;
  sessions: SessionProjectionListItem[];
  onOpenSession: (sessionId: string) => void;
  onNewSession: (projectId: string) => void;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className="shrink-0"
        data-testid="sidebar-titlebar-spacer"
        style={titlebarHeaderStyle}
      />
      <Sidebar.Content className="min-h-0 flex-1 flex-col overflow-hidden">
        <TraceUsageNavigation pathname={pathname} />
        <WorkspaceNavigation
          draftViewActive={draftViewActive}
          pathname={pathname}
          selectedSessionId={selectedSessionId}
          sessions={sessions}
          onOpenSession={onOpenSession}
          onNewSession={onNewSession}
        />
      </Sidebar.Content>
      <Sidebar.Footer className="shrink-0">
        <SystemNavigation pathname={pathname} />
      </Sidebar.Footer>
    </>
  );
}

function HeaderChrome({
  title,
  toolbarActions,
  sidebarOpen,
  mainLeft,
}: {
  title: string;
  toolbarActions?: ReactNode;
  sidebarOpen: boolean;
  mainLeft: string;
}) {
  const titleX = sidebarOpen
    ? mainLeft
    : chromeSafeLeft;
  const chromeStyle = {
    "--pig-chrome-safe-left": chromeSafeLeft,
    "--pig-header-height": titlebarHeight,
    "--pig-main-left": mainLeft,
    "--pig-title-x": titleX,
    "--pig-traffic-width": trafficWidth,
    height: titlebarHeight,
  } as CSSProperties;
  const titleTrackStyle = {
    "--pig-main-left": mainLeft,
    "--pig-title-x": titleX,
    left: "var(--pig-chrome-safe-left)",
  } as CSSProperties;
  const titleStyle = {
    "--pig-title-x": titleX,
    transform: `translateX(calc(${titleX} - var(--pig-chrome-safe-left)))`,
  } as CSSProperties;

  return (
    <div
      className="pig-header-chrome"
      data-sidebar={sidebarOpen ? "open" : "closed"}
      data-testid="header-chrome"
      style={chromeStyle}
    >
      <div className="pig-header-chrome__left" data-testid="header-chrome-left">
        <div
          aria-hidden="true"
          className="h-full shrink-0"
          data-window-drag-region
          data-testid="mac-traffic-space"
          style={{ width: trafficWidth }}
        />
        <Sidebar.Trigger
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="shrink-0"
          style={titlebarControlStyle}
        />
        <div
          aria-hidden="true"
          className="h-full min-w-0 flex-1"
          data-window-drag-region
        />
      </div>
      <div
        className="pig-header-chrome__title-track"
        data-testid="header-chrome-title-track"
        style={titleTrackStyle}
      >
        <div
          className="pig-header-chrome__title flex h-7 min-w-0 shrink-0 select-none items-center"
          data-testid="header-chrome-title"
          style={titleStyle}
        >
          <h1 className="select-none truncate text-sm font-semibold leading-7 tracking-normal text-foreground">
            {title}
          </h1>
        </div>
        <div
          aria-hidden="true"
          className="pig-header-chrome__drag h-full min-w-0 flex-1 select-none"
          data-slot="navbar-spacer"
          data-window-drag-region
        />
        {toolbarActions ? (
          <div
            className="pig-header-chrome__actions flex h-full shrink-0 items-center gap-1"
            data-testid="navbar-actions"
          >
            {toolbarActions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AppFrame({
  children,
  toolbarActions,
  sessionProjections,
  selectedSessionId,
  onSelectedSessionIdChange,
}: AppFrameProps) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const draftViewActive = useRouterState({
    select: (state) => {
      const search = state.location.search as { view?: string };

      return pathname.startsWith("/projects/") && search.view === "draft";
    },
  });
  const activeTab = getActiveTab(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarAnimating, setSidebarAnimating] = useState(false);
  const [measuredSidebarWidth, setMeasuredSidebarWidth] = useState(sidebarDefaultSize);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const sidebarAnimatingRef = useRef(false);
  const sidebarOpenRef = useRef(sidebarOpen);
  const sidebarAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localSessionProjections, setLocalSessionProjections] = useState(
    defaultSidebarProjectSessionProjections,
  );
  const effectiveSessionProjections = sessionProjections ?? localSessionProjections;
  const sessions = useMemo(
    () => getSessionProjectionListItems(effectiveSessionProjections),
    [effectiveSessionProjections],
  );
  const [localSelectedSessionId, setLocalSelectedSessionId] = useState<string | null>(
    () => getSessionProjectionListItems(defaultSidebarProjectSessionProjections)[0]?.id ?? null,
  );
  const effectiveSelectedSessionId =
    selectedSessionId === undefined ? localSelectedSessionId : selectedSessionId;
  const updateSelectedSessionId = onSelectedSessionIdChange ?? setLocalSelectedSessionId;
  const headerMainLeft = sidebarOpen ? measuredSidebarWidth : "0px";
  const handleSidebarOpenChange = (open: boolean) => {
    if (sidebarAnimationTimeoutRef.current) {
      clearTimeout(sidebarAnimationTimeoutRef.current);
    }

    sidebarAnimatingRef.current = true;
    sidebarOpenRef.current = open;
    setSidebarAnimating(true);
    setSidebarOpen(open);
    sidebarAnimationTimeoutRef.current = setTimeout(() => {
      sidebarAnimatingRef.current = false;
      setSidebarAnimating(false);
      sidebarAnimationTimeoutRef.current = null;
    }, sidebarAnimationMs);
  };

  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    sidebarAnimatingRef.current = sidebarAnimating;
  }, [sidebarAnimating]);

  useEffect(
    () => () => {
      if (sidebarAnimationTimeoutRef.current) {
        clearTimeout(sidebarAnimationTimeoutRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const root = layoutRef.current;
    if (!root) {
      return;
    }

    const sidebarPanel =
      root.querySelector<HTMLElement>('[data-testid="app-layout-sidebar"][data-panel]') ??
      root.querySelector<HTMLElement>(".sidebar__offcanvas-wrapper");
    if (!sidebarPanel || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateSidebarWidth = () => {
      const width = sidebarPanel.getBoundingClientRect().width;

      if (width <= 0 || sidebarAnimatingRef.current || !sidebarOpenRef.current) {
        return;
      }

      setMeasuredSidebarWidth(`${Math.round(width)}px`);
    };

    updateSidebarWidth();

    const observer = new ResizeObserver(updateSidebarWidth);
    observer.observe(sidebarPanel);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleNewSession = (projectId: string) => {
    ensureSessionDraft(projectId);
    void router.navigate({
      to: sidebarProject.route as never,
      search: { view: "draft" } as never,
    });
  };
  const handleOpenSession = (sessionId: string) => {
    updateSelectedSessionId(sessionId);
    void router.navigate({
      to: sidebarProject.route as never,
    });
  };

  return (
    <AppLayout
      ref={layoutRef}
      className="pig-app-layout bg-background text-foreground"
      data-sidebar-animating={sidebarAnimating ? "true" : undefined}
      navigate={(href) => void router.navigate({ to: href as never })}
      resizableAutoSaveId="pig-app-shell"
      scrollMode="content"
      sidebar={
        <Sidebar style={sidebarStyle}>
          <SidebarPanelContent
            draftViewActive={draftViewActive}
            pathname={pathname}
            selectedSessionId={effectiveSelectedSessionId}
            sessions={sessions}
            onOpenSession={handleOpenSession}
            onNewSession={handleNewSession}
          />
        </Sidebar>
      }
      sidebarCollapsible="offcanvas"
      sidebarDefaultSize={sidebarDefaultSize}
      sidebarMaxSize={sidebarMaxSize}
      sidebarMinSize={sidebarMinSize}
      sidebarOpen={sidebarOpen}
      sidebarResizable
      sidebarVariant="inset"
      onSidebarOpenChange={handleSidebarOpenChange}
    >
      <HeaderChrome
        mainLeft={headerMainLeft}
        sidebarOpen={sidebarOpen}
        title={activeTab}
        toolbarActions={toolbarActions}
      />
      <div
        className="flex h-full min-h-0 min-w-0 flex-col"
        data-testid="app-frame-content"
      >
        <div aria-hidden="true" className="h-10 shrink-0" />
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    </AppLayout>
  );
}
