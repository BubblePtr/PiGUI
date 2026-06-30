import { useRouter, useRouterState } from "@tanstack/react-router";
import { AppLayout } from "@heroui-pro/react/app-layout";
import { Sidebar } from "@heroui-pro/react/sidebar";
import {
  BarChart3,
  ChatAdd,
  ChevronRight,
  Circle,
  FolderClosed,
  FolderOpen,
  FolderOpenState,
  LayoutAlignLeft,
  ListTree,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  SidebarLeft,
  Trash2,
} from "@/shared/ui/icons";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Key,
  type ReactNode,
} from "react";
import {
  addProjectToRegistry,
  getProjectRegistry,
  renameProjectInRegistry,
  removeProjectFromRegistry,
  subscribeProjectRegistry,
  type ProjectRegistryEntry,
} from "@/entities/project/project-registry";
import {
  hasFollowUpDraft,
  subscribeFollowUpDrafts,
} from "@/entities/session/follow-up-drafts";
import {
  ensureSessionDraft,
  getSessionDraft,
  setSessionDraftTarget,
} from "@/entities/session/session-drafts";
import {
  createSessionProjection,
  getSessionProjectionListItems,
  type SessionProjection,
  type SessionProjectionListItem,
} from "@/entities/session/session-projection";
import { revealProjectInFinder, selectProjectDirectory } from "@/shared/runtime";
import {
  SidebarActionDropdown,
  SidebarActionDropdownItem,
} from "./sidebar-action-dropdown";

type AppFrameProps = {
  sidebar?: ReactNode;
  toolbarActions?: ReactNode;
  sessionProjections?: SessionProjection[];
  selectedSessionId?: string | null;
  onSelectedSessionIdChange?: (sessionId: string | null) => void;
  children: ReactNode;
};

const defaultSidebarProjectId = "/Users/void/code/opensource/Pig";

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
    projectId: defaultSidebarProjectId,
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

const sidebarDefaultSize = "260px";
const sidebarMinSize = "240px";
const sidebarMaxSize = "320px";
const projectExpansionStorageKey = "pigui.projectSidebar.expanded.v1";
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

function ProjectExpansionIndicator({ expanded }: { expanded: boolean }) {
  const StateIcon = expanded ? FolderOpenState : FolderClosed;

  return (
    <span
      aria-hidden="true"
      className="pigui-project-expansion-indicator"
      data-expanded={expanded ? "true" : "false"}
    >
      <StateIcon className="pigui-project-expansion-indicator__state" />
      <ChevronRight className="pigui-project-expansion-indicator__chevron" />
    </span>
  );
}

function projectRoute(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/sessions`;
}

function projectIdFromRoute(pathname: string, projects: ProjectRegistryEntry[]) {
  const match = /^\/projects\/(.+)\/sessions$/.exec(pathname);

  if (!match) {
    return null;
  }

  const projectId = decodeURIComponent(match[1]);

  return projects.some((project) => project.id === projectId) ? projectId : null;
}

function readProjectExpansionState(): Record<string, boolean> {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(projectExpansionStorageKey);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => {
        const [projectId, expanded] = entry;

        return typeof projectId === "string" && typeof expanded === "boolean";
      }),
    );
  } catch {
    return {};
  }
}

function writeProjectExpansionState(expandedProjects: Record<string, boolean>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(projectExpansionStorageKey, JSON.stringify(expandedProjects));
}

function AddProjectButton({
  onAddProject,
}: {
  onAddProject: (path: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);

  const chooseProject = async () => {
    if (choosing) {
      return;
    }

    setChoosing(true);
    try {
      const selectedPath = await selectProjectDirectory();
      const candidate = selectedPath?.trim();

      if (candidate) {
        onAddProject(candidate);
      }
    } finally {
      setChoosing(false);
    }
  };

  return (
    <div className="px-3 py-2">
      <button
        aria-busy={choosing}
        className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-default px-2 text-sm text-foreground transition-colors hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        type="button"
        onClick={() => void chooseProject()}
      >
        <Plus aria-hidden="true" className="size-4" />
        Add Project
      </button>
    </div>
  );
}

function ProjectNavigation({
  draftViewActive,
  pathname,
  projects,
  selectedSessionId,
  sessions,
  expandedProjects,
  onAddProject,
  onToggleProject,
  onOpenSession,
  onRenameProject,
  onRevealProject,
  onRemoveProject,
}: {
  draftViewActive: boolean;
  pathname: string;
  projects: ProjectRegistryEntry[];
  selectedSessionId: string | null;
  sessions: SessionProjectionListItem[];
  expandedProjects: Record<string, boolean>;
  onAddProject: (path: string) => void;
  onToggleProject: (projectId: string) => void;
  onOpenSession: (sessionId: string, projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onRevealProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
}) {
  const projectActive = pathname.startsWith("/projects/");
  const [followUpDraftVersion, setFollowUpDraftVersion] = useState(0);

  useEffect(
    () =>
      subscribeFollowUpDrafts(() => {
        setFollowUpDraftVersion((version) => version + 1);
      }),
    [],
  );

  if (projects.length === 0) {
    return (
      <Sidebar.Group
        className="min-h-0 flex-1 overflow-y-auto"
        data-testid="sidebar-projects"
      >
        <Sidebar.GroupLabel className="px-3 text-sm normal-case">
          Projects
        </Sidebar.GroupLabel>
        <AddProjectButton onAddProject={onAddProject} />
      </Sidebar.Group>
    );
  }

  return (
    <Sidebar.Group
      className="min-h-0 flex-1 overflow-y-auto"
      data-testid="sidebar-projects"
    >
      <Sidebar.GroupLabel className="px-3 text-sm normal-case">
        Projects
      </Sidebar.GroupLabel>
      {projects.map((project) => {
        const projectSessions = sessions.filter(
          (session) => session.projection.projectId === project.id,
        );
        const expanded = expandedProjects[project.id] ?? true;
        const hasProjectDraft = projectSessions.some((session) =>
          hasFollowUpDraft(session.id),
        );

        void followUpDraftVersion;

        const projectMenuItemId = `project:${project.id}`;
        const projectExpandedKeys = expanded ? [projectMenuItemId] : [];
        const onProjectExpandedChange = (keys: "all" | Set<Key>) => {
          const nextExpanded = keys === "all" || keys.has(projectMenuItemId);

          if (nextExpanded !== expanded) {
            onToggleProject(project.id);
          }
        };

        return (
          <div key={project.id} className="grid gap-1">
            <Sidebar.Menu
              aria-label={`${project.displayName} project sessions`}
              expandedKeys={projectExpandedKeys}
              showGuideLines={false}
              onExpandedChange={onProjectExpandedChange}
            >
              <Sidebar.MenuItem
                id={projectMenuItemId}
                closeMobileOnAction={false}
                textValue={project.displayName}
              >
                <Sidebar.MenuTrigger>
                  <ProjectExpansionIndicator expanded={expanded} />
                </Sidebar.MenuTrigger>
                <Sidebar.MenuLabel>{project.displayName}</Sidebar.MenuLabel>
                {hasProjectDraft ? (
                  <Sidebar.MenuChip>
                    <DraftBadge />
                  </Sidebar.MenuChip>
                ) : null}
                <Sidebar.MenuActions className="ml-auto">
                  <SidebarActionDropdown
                    ariaLabel={`Project actions for ${project.displayName}`}
                    icon={<MoreHorizontal aria-hidden="true" />}
                    onAction={(key) => {
                      if (key === "rename-project") {
                        onRenameProject(project.id);
                        return;
                      }

                      if (key === "reveal-project") {
                        onRevealProject(project.id);
                        return;
                      }

                      if (key === "remove-project") {
                        onRemoveProject(project.id);
                      }
                    }}
                  >
                    <SidebarActionDropdownItem
                      icon={(
                        <Pencil aria-hidden="true" />
                      )}
                      id="rename-project"
                      textValue="Rename Project"
                    >
                      Rename Project
                    </SidebarActionDropdownItem>
                    <SidebarActionDropdownItem
                      icon={(
                        <FolderOpen aria-hidden="true" />
                      )}
                      id="reveal-project"
                      textValue="Reveal in Finder"
                    >
                      Reveal in Finder
                    </SidebarActionDropdownItem>
                    <SidebarActionDropdownItem
                      icon={(
                        <Trash2 aria-hidden="true" />
                      )}
                      id="remove-project"
                      textValue="Remove Project..."
                      variant="danger"
                    >
                      Remove Project...
                    </SidebarActionDropdownItem>
                  </SidebarActionDropdown>
                </Sidebar.MenuActions>
                <Sidebar.Submenu>
                  {projectSessions.length === 0 ? (
                    <Sidebar.MenuItem
                      id={`${project.id}-empty`}
                      isDisabled
                      textValue="No chats"
                    >
                      <Sidebar.MenuLabel>No chats</Sidebar.MenuLabel>
                    </Sidebar.MenuItem>
                  ) : null}
                  {projectSessions.map((session) => (
                    <Sidebar.MenuItem
                      key={session.id}
                      id={session.id}
                      isCurrent={
                        !draftViewActive && projectActive && session.id === selectedSessionId
                      }
                      textValue={session.title}
                      onAction={() => onOpenSession(session.id, project.id)}
                    >
                      <Sidebar.MenuIcon className="justify-center">
                        <SidebarSessionGlyph active={session.active} unread={session.unread} />
                      </Sidebar.MenuIcon>
                      <Sidebar.MenuLabel className="min-w-0">
                        <span className="block truncate">{session.title}</span>
                      </Sidebar.MenuLabel>
                      <Sidebar.MenuChip>
                        <span className="text-muted text-[10px] leading-none">
                          {session.updatedAt.slice(11, 16)}
                        </span>
                      </Sidebar.MenuChip>
                      {hasFollowUpDraft(session.id) ? (
                        <Sidebar.MenuActions className="ml-auto">
                          <DraftBadge />
                        </Sidebar.MenuActions>
                      ) : null}
                    </Sidebar.MenuItem>
                  ))}
                </Sidebar.Submenu>
              </Sidebar.MenuItem>
            </Sidebar.Menu>
          </div>
        );
      })}
      <AddProjectButton onAddProject={onAddProject} />
    </Sidebar.Group>
  );
}

function TraceUsageNavigation({
  draftViewActive,
  hasProjects,
  pathname,
  onNewSession,
}: {
  draftViewActive: boolean;
  hasProjects: boolean;
  pathname: string;
  onNewSession: () => void;
}) {
  return (
    <Sidebar.Group>
      <Sidebar.Menu aria-label="Trace and usage navigation" showGuideLines={false}>
        {hasProjects ? (
          <Sidebar.MenuItem
            id="global-new-session"
            isCurrent={draftViewActive}
            textValue="New Session"
            onAction={onNewSession}
          >
            <Sidebar.MenuIcon>
              <ChatAdd className="size-4" />
            </Sidebar.MenuIcon>
            <Sidebar.MenuLabel>New Session</Sidebar.MenuLabel>
          </Sidebar.MenuItem>
        ) : null}
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
  projects,
  selectedSessionId,
  sessions,
  expandedProjects,
  onAddProject,
  onToggleProject,
  onOpenSession,
  onNewSession,
  onRenameProject,
  onRevealProject,
  onRemoveProject,
}: {
  draftViewActive: boolean;
  pathname: string;
  projects: ProjectRegistryEntry[];
  selectedSessionId: string | null;
  sessions: SessionProjectionListItem[];
  expandedProjects: Record<string, boolean>;
  onAddProject: (path: string) => void;
  onToggleProject: (projectId: string) => void;
  onOpenSession: (sessionId: string, projectId: string) => void;
  onNewSession: () => void;
  onRenameProject: (projectId: string) => void;
  onRevealProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
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
        <TraceUsageNavigation
          draftViewActive={draftViewActive}
          hasProjects={projects.length > 0}
          pathname={pathname}
          onNewSession={onNewSession}
        />
        <ProjectNavigation
          draftViewActive={draftViewActive}
          pathname={pathname}
          projects={projects}
          selectedSessionId={selectedSessionId}
          sessions={sessions}
          expandedProjects={expandedProjects}
          onAddProject={onAddProject}
          onToggleProject={onToggleProject}
          onOpenSession={onOpenSession}
          onRenameProject={onRenameProject}
          onRevealProject={onRevealProject}
          onRemoveProject={onRemoveProject}
        />
      </Sidebar.Content>
      <Sidebar.Footer className="shrink-0">
        <SystemNavigation pathname={pathname} />
      </Sidebar.Footer>
    </>
  );
}

function SidebarToggleIcon({ sidebarOpen }: { sidebarOpen: boolean }) {
  const Icon = sidebarOpen ? SidebarLeft : LayoutAlignLeft;

  return <Icon aria-hidden="true" className="size-4" />;
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
    "--pigui-chrome-safe-left": chromeSafeLeft,
    "--pigui-header-height": titlebarHeight,
    "--pigui-main-left": mainLeft,
    "--pigui-title-x": titleX,
    "--pigui-traffic-width": trafficWidth,
    height: titlebarHeight,
  } as CSSProperties;
  const titleTrackStyle = {
    "--pigui-main-left": mainLeft,
    "--pigui-title-x": titleX,
    left: "var(--pigui-chrome-safe-left)",
  } as CSSProperties;
  const titleStyle = {
    "--pigui-title-x": titleX,
    transform: `translateX(calc(${titleX} - var(--pigui-chrome-safe-left)))`,
  } as CSSProperties;

  return (
    <div
      className="pigui-header-chrome"
      data-sidebar={sidebarOpen ? "open" : "closed"}
      data-testid="header-chrome"
      style={chromeStyle}
    >
      <div className="pigui-header-chrome__left" data-testid="header-chrome-left">
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
        >
          <SidebarToggleIcon sidebarOpen={sidebarOpen} />
        </Sidebar.Trigger>
        <div
          aria-hidden="true"
          className="h-full min-w-0 flex-1"
          data-window-drag-region
        />
      </div>
      <div
        className="pigui-header-chrome__title-track"
        data-testid="header-chrome-title-track"
        style={titleTrackStyle}
      >
        <div
          className="pigui-header-chrome__title flex h-7 min-w-0 shrink-0 select-none items-center"
          data-testid="header-chrome-title"
          style={titleStyle}
        >
          <h1 className="select-none truncate text-sm font-semibold leading-7 tracking-normal text-foreground">
            {title}
          </h1>
        </div>
        <div
          aria-hidden="true"
          className="pigui-header-chrome__drag h-full min-w-0 flex-1 select-none"
          data-slot="navbar-spacer"
          data-window-drag-region
        />
        {toolbarActions ? (
          <div
            className="pigui-header-chrome__actions flex h-full shrink-0 items-center gap-1"
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
  const [projects, setProjects] = useState(() => getProjectRegistry());
  const [expandedProjects, setExpandedProjects] = useState(() =>
    readProjectExpansionState(),
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

  useEffect(() => subscribeProjectRegistry(() => setProjects(getProjectRegistry())), []);

  const updateExpandedProjects = (
    updater: (expandedProjects: Record<string, boolean>) => Record<string, boolean>,
  ) => {
    setExpandedProjects((currentExpandedProjects) => {
      const nextExpandedProjects = updater(currentExpandedProjects);

      writeProjectExpansionState(nextExpandedProjects);

      return nextExpandedProjects;
    });
  };

  useEffect(() => {
    if (!effectiveSelectedSessionId) {
      return;
    }

    const selectedProjection = effectiveSessionProjections.find(
      (projection) => projection.id === effectiveSelectedSessionId,
    );

    if (!selectedProjection) {
      return;
    }

    updateExpandedProjects((currentExpandedProjects) => ({
      ...currentExpandedProjects,
      [selectedProjection.projectId]: true,
    }));
  }, [effectiveSelectedSessionId, effectiveSessionProjections]);

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

  const openSessionDraft = (
    targetProjectId: string | null,
    routeProjectId = targetProjectId,
  ) => {
    ensureSessionDraft(targetProjectId);
    const navigationProjectId =
      routeProjectId ?? projectIdFromRoute(pathname, projects) ?? projects[0]?.id;

    if (!navigationProjectId) {
      return;
    }

    void router.navigate({
      to: projectRoute(navigationProjectId) as never,
      search: { view: "draft" } as never,
    });
  };
  const handleNewSession = () => {
    openSessionDraft(null);
  };
  const handleAddProject = (path: string) => {
    const result = addProjectToRegistry(path);

    updateExpandedProjects((currentExpandedProjects) => ({
      ...currentExpandedProjects,
      [result.project.id]: true,
    }));
    openSessionDraft(result.project.id, result.project.id);
  };
  const handleRenameProject = (projectId: string) => {
    const project = projects.find((candidate) => candidate.id === projectId);

    if (!project) {
      return;
    }

    const nextDisplayName = window.prompt("Rename Project", project.displayName);

    if (nextDisplayName === null) {
      return;
    }

    renameProjectInRegistry(project.id, nextDisplayName);
  };
  const handleRevealProject = (projectId: string) => {
    const project = projects.find((candidate) => candidate.id === projectId);

    if (!project) {
      return;
    }

    void revealProjectInFinder(project.path);
  };
  const handleRemoveProject = (projectId: string) => {
    const project = projects.find((candidate) => candidate.id === projectId);

    if (!project) {
      return;
    }

    const confirmed = window.confirm(
      [
        `Remove ${project.displayName} from PiGUI?`,
        "",
        "Local files and historical Sessions will not be deleted.",
        "If this Project is the current draft target, the draft text will be kept and the target cleared.",
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    if (getSessionDraft()?.projectId === projectId) {
      setSessionDraftTarget(null);
    }

    removeProjectFromRegistry(projectId);
    updateExpandedProjects((currentExpandedProjects) => {
      const { [projectId]: _removedProject, ...nextExpandedProjects } =
        currentExpandedProjects;

      return nextExpandedProjects;
    });

    const selectedProjection = effectiveSelectedSessionId
      ? effectiveSessionProjections.find(
          (projection) => projection.id === effectiveSelectedSessionId,
        )
      : null;

    if (selectedProjection?.projectId !== projectId) {
      return;
    }

    updateSelectedSessionId(null);
    ensureSessionDraft(null);
    void router.navigate({
      to: projectRoute(projectId) as never,
      search: { view: "draft" } as never,
    });
  };
  const handleToggleProject = (projectId: string) => {
    updateExpandedProjects((currentExpandedProjects) => ({
      ...currentExpandedProjects,
      [projectId]: !(currentExpandedProjects[projectId] ?? true),
    }));
  };
  const handleOpenSession = (sessionId: string, projectId: string) => {
    updateSelectedSessionId(sessionId);
    updateExpandedProjects((currentExpandedProjects) => ({
      ...currentExpandedProjects,
      [projectId]: true,
    }));
    void router.navigate({
      to: projectRoute(projectId) as never,
    });
  };

  return (
    <AppLayout
      ref={layoutRef}
      className="pigui-app-layout bg-background text-foreground"
      data-sidebar-animating={sidebarAnimating ? "true" : undefined}
      navigate={(href) => void router.navigate({ to: href as never })}
      resizableAutoSaveId="pigui-app-shell"
      scrollMode="content"
      sidebar={
        <Sidebar style={sidebarStyle}>
          <SidebarPanelContent
            draftViewActive={draftViewActive}
            pathname={pathname}
            projects={projects}
            selectedSessionId={effectiveSelectedSessionId}
            sessions={sessions}
            expandedProjects={expandedProjects}
            onAddProject={handleAddProject}
            onToggleProject={handleToggleProject}
            onOpenSession={handleOpenSession}
            onNewSession={handleNewSession}
            onRenameProject={handleRenameProject}
            onRevealProject={handleRevealProject}
            onRemoveProject={handleRemoveProject}
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
