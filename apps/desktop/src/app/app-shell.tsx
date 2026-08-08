import { useRouter, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@astryxdesign/core/AppShell";
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack } from "@astryxdesign/core/Stack";
import {
  BarChart3,
  ChatAdd,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  FolderOpenState,
  LayoutAlignLeft,
  ListTree,
  MoreHorizontal,
  Palette,
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
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
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
import { formatSessionListTime } from "@/entities/session/sessions";
import { useSessionProjectionsOptional } from "@/entities/session/use-session-projections";
import {
  browserDevelopmentProjectId,
  getProjectRegistryWithBrowserDevelopmentFallback,
  shouldUseBrowserDevelopmentData,
} from "@/shared/browser-development-data";
import { DotMatrix } from "@/shared/ui/dot-matrix";
import { revealProjectInFinder, selectProjectDirectory } from "@/shared/runtime";

type AppFrameProps = {
  sidebar?: ReactNode;
  /**
   * When false, render only the window titlebar chrome + content (no app sidebar).
   * Used by first-run preflight: needs traffic-light titlebar, not navigation.
   */
  showSidebar?: boolean;
  toolbarActions?: ReactNode;
  sessionProjections?: SessionProjection[];
  /** False until first successful projection list (or intentional empty after retries). */
  sessionsHydrated?: boolean;
  selectedSessionId?: string | null;
  onSelectedSessionIdChange?: (sessionId: string | null) => void;
  children: ReactNode;
};

const defaultSidebarProjectId = browserDevelopmentProjectId;

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
    modelControls: {
      models: [
        {
          provider: "openai",
          modelId: "gpt-5-codex",
          name: "GPT-5 Codex",
          thinkingLevels: ["off", "low", "medium", "high"],
        },
        {
          provider: "anthropic",
          modelId: "claude-sonnet-4",
          name: "Claude Sonnet 4",
          thinkingLevels: ["off", "low", "medium", "high"],
        },
      ],
      selected: {
        provider: "openai",
        modelId: "gpt-5-codex",
        thinkingLevel: "high",
      },
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
  // Dev-only design gallery entry; DEV folds to false in production builds
  // so the item never ships.
  ...(import.meta.env.DEV
    ? [
        {
          label: "Design",
          to: "/design",
          icon: Palette,
          isActive: (pathname: string) => pathname === "/design",
        },
      ]
    : []),
  {
    label: "Settings",
    to: "/settings",
    icon: Settings,
    isActive: (pathname: string) =>
      pathname === "/settings" || pathname.startsWith("/settings/"),
  },
] as const;

const sidebarDefaultSize = "260px";
const projectExpansionStorageKey = "pigui.projectSidebar.expanded.v1";

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

function getVisibleProjectRegistry() {
  return getProjectRegistryWithBrowserDevelopmentFallback(getProjectRegistry());
}

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

  if (pathname === "/preflight") {
    return "Preflight";
  }

  if (pathname === "/design") {
    return "Design";
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
      <DotMatrix aria-label="Active run" className="text-primary" />
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

  return null;
}

function SessionGlyphSlot({
  active,
  unread,
}: {
  active: boolean;
  unread: boolean;
}) {
  return (
    <span className="pigui-session-glyph" data-testid="session-glyph">
      <SidebarSessionGlyph active={active} unread={unread} />
    </span>
  );
}

function UnsentFollowUpIndicator() {
  return (
    <span
      aria-label="Unsent follow-up"
      className="inline-flex size-4 items-center justify-center text-primary"
      role="img"
    >
      <Pencil aria-hidden="true" className="size-3" />
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

/** Keep clicks on row-embedded actions from also toggling/activating the row. */
function stopRowActivation(event: ReactMouseEvent) {
  event.stopPropagation();
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

  // SideNavItem (not Button) so the collapsed 48px rail collapses it to an
  // icon like every other nav row instead of overflowing its label.
  return (
    <SideNavItem
      icon={<Plus aria-hidden="true" className="size-4" />}
      isDisabled={choosing}
      label="Add Project"
      onClick={() => void chooseProject()}
    />
  );
}

function ProjectActionsMenu({
  project,
  onRenameProject,
  onRevealProject,
  onRemoveProject,
}: {
  project: ProjectRegistryEntry;
  onRenameProject: (projectId: string) => void;
  onRevealProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
}) {
  return (
    <MoreMenu
      icon={<MoreHorizontal aria-hidden="true" />}
      label={`Project actions for ${project.displayName}`}
      size="sm"
      items={[
        {
          label: "Rename Project",
          icon: <Pencil aria-hidden="true" />,
          onClick: () => onRenameProject(project.id),
        },
        {
          label: "Reveal in Finder",
          icon: <FolderOpen aria-hidden="true" />,
          onClick: () => onRevealProject(project.id),
        },
        // Destructive action separated from safe actions; Astryx MoreMenu has
        // no destructive item variant yet, so a divider carries the intent.
        { type: "divider" },
        {
          label: "Remove Project...",
          icon: <Trash2 aria-hidden="true" />,
          onClick: () => onRemoveProject(project.id),
        },
      ]}
    />
  );
}

function ProjectNavigation({
  draftViewActive,
  pathname,
  projects,
  selectedSessionId,
  sessions,
  sessionsHydrated,
  expandedProjects,
  onAddProject,
  onToggleProject,
  onOpenSession,
  onNewProjectSession,
  onRenameProject,
  onRevealProject,
  onRemoveProject,
}: {
  draftViewActive: boolean;
  pathname: string;
  projects: ProjectRegistryEntry[];
  selectedSessionId: string | null;
  sessions: SessionProjectionListItem[];
  sessionsHydrated: boolean;
  expandedProjects: Record<string, boolean>;
  onAddProject: (path: string) => void;
  onToggleProject: (projectId: string) => void;
  onOpenSession: (sessionId: string, projectId: string) => void;
  onNewProjectSession: (projectId: string) => void;
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
      <SideNavSection data-testid="sidebar-projects" title="Projects">
        <AddProjectButton onAddProject={onAddProject} />
      </SideNavSection>
    );
  }

  return (
    <SideNavSection data-testid="sidebar-projects" title="Projects">
      {projects.map((project) => {
        const projectSessions = sessions.filter(
          (session) => session.projection.projectId === project.id,
        );
        const expanded = expandedProjects[project.id] ?? true;
        const hasProjectUnsentFollowUp = projectSessions.some((session) =>
          hasFollowUpDraft(session.id),
        );

        void followUpDraftVersion;

        return (
          <SideNavItem
            key={project.id}
            collapsible={{
              isCollapsed: !expanded,
              onCollapsedChange: () => onToggleProject(project.id),
            }}
            icon={<ProjectExpansionIndicator expanded={expanded} />}
            label={project.displayName}
            endContent={
              <HStack gap={0.5} vAlign="center" onClick={stopRowActivation}>
                {!expanded && hasProjectUnsentFollowUp ? (
                  <UnsentFollowUpIndicator />
                ) : null}
                <IconButton
                  icon={<Plus aria-hidden="true" />}
                  label={`New Session for ${project.displayName}`}
                  size="sm"
                  variant="ghost"
                  onClick={() => onNewProjectSession(project.id)}
                />
                <ProjectActionsMenu
                  project={project}
                  onRenameProject={onRenameProject}
                  onRevealProject={onRevealProject}
                  onRemoveProject={onRemoveProject}
                />
              </HStack>
            }
          >
            {projectSessions.length === 0 ? (
              <SideNavItem
                icon={<SessionGlyphSlot active={false} unread={false} />}
                isDisabled
                label={sessionsHydrated ? "No chats" : "Loading chats"}
              />
            ) : null}
            {projectSessions.map((session) => {
              const hasSessionUnsentFollowUp = hasFollowUpDraft(session.id);

              return (
                <SideNavItem
                  key={session.id}
                  icon={<SessionGlyphSlot active={session.active} unread={session.unread} />}
                  isSelected={
                    !draftViewActive && projectActive && session.id === selectedSessionId
                  }
                  label={session.title}
                  endContent={
                    <HStack gap={1} vAlign="center">
                      {hasSessionUnsentFollowUp ? <UnsentFollowUpIndicator /> : null}
                      <span className="text-muted text-[10px] leading-none">
                        {formatSessionListTime(session.updatedAt)}
                      </span>
                    </HStack>
                  }
                  onClick={() => onOpenSession(session.id, project.id)}
                />
              );
            })}
          </SideNavItem>
        );
      })}
      <AddProjectButton onAddProject={onAddProject} />
    </SideNavSection>
  );
}

function TraceUsageNavigation({
  draftViewActive,
  hasProjects,
  pathname,
  onNavigate,
  onNewSession,
}: {
  draftViewActive: boolean;
  hasProjects: boolean;
  pathname: string;
  onNavigate: (to: string) => void;
  onNewSession: () => void;
}) {
  return (
    <SideNavSection isHeaderHidden title="Trace and usage navigation">
      {hasProjects ? (
        <SideNavItem
          icon={<ChatAdd aria-hidden="true" className="size-4" />}
          isSelected={draftViewActive}
          label="New Session"
          onClick={onNewSession}
        />
      ) : null}
      {traceUsageNavigationItems.map((item) => {
        const Icon = item.icon;
        const active = item.isActive(pathname);

        return (
          <SideNavItem
            key={item.to}
            icon={<Icon aria-hidden="true" className="size-4" />}
            isSelected={active}
            label={item.label}
            onClick={() => onNavigate(item.to)}
          />
        );
      })}
    </SideNavSection>
  );
}

function SystemNavigation({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: (to: string) => void;
}) {
  return (
    <SideNavSection data-testid="sidebar-system" isHeaderHidden title="System navigation">
      {systemNavigationItems.map((item) => {
        const Icon = item.icon;
        const active = item.isActive(pathname);

        return (
          <SideNavItem
            key={item.to}
            icon={<Icon aria-hidden="true" className="size-4" />}
            isSelected={active}
            label={item.label}
            onClick={() => onNavigate(item.to)}
          />
        );
      })}
    </SideNavSection>
  );
}

function SidebarToggleIcon({ sidebarOpen }: { sidebarOpen: boolean }) {
  const Icon = sidebarOpen ? SidebarLeft : LayoutAlignLeft;

  return <Icon aria-hidden="true" className="size-4" />;
}

function HeaderChrome({
  chromeRef,
  title,
  toolbarActions,
  sidebarOpen,
  mainLeft,
  showSidebarToggle = true,
  onToggleSidebar,
}: {
  chromeRef: RefObject<HTMLDivElement | null>;
  title: string;
  toolbarActions?: ReactNode;
  sidebarOpen: boolean;
  mainLeft: string;
  showSidebarToggle?: boolean;
  onToggleSidebar?: () => void;
}) {
  const chromeStyle = {
    "--pigui-chrome-safe-left": chromeSafeLeft,
    "--pigui-header-height": titlebarHeight,
    "--pigui-main-left": mainLeft,
    "--pigui-traffic-width": trafficWidth,
    height: titlebarHeight,
  } as CSSProperties;
  const titleTrackStyle = {
    left: "var(--pigui-chrome-safe-left)",
  } as CSSProperties;
  const titleStyle = {
    transform:
      "translateX(calc(max(var(--pigui-main-left), var(--pigui-chrome-safe-left)) - var(--pigui-chrome-safe-left)))",
  } as CSSProperties;

  return (
    <div
      ref={chromeRef}
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
        {showSidebarToggle ? (
          <button
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="inline-flex shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted/10"
            data-slot="sidebar-trigger"
            style={titlebarControlStyle}
            type="button"
            onClick={onToggleSidebar}
          >
            <SidebarToggleIcon sidebarOpen={sidebarOpen} />
          </button>
        ) : null}
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
  showSidebar = true,
  toolbarActions,
  sessionProjections,
  sessionsHydrated,
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
  const headerChromeRef = useRef<HTMLDivElement | null>(null);
  const sidebarAnimatingRef = useRef(false);
  const sidebarOpenRef = useRef(sidebarOpen);
  const sidebarAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionProjectionsStore = useSessionProjectionsOptional();
  const [localSessionProjections] = useState(() =>
    shouldUseBrowserDevelopmentData()
      ? defaultSidebarProjectSessionProjections
      : [],
  );
  const [projects, setProjects] = useState(() => getVisibleProjectRegistry());
  const [expandedProjects, setExpandedProjects] = useState(() =>
    readProjectExpansionState(),
  );
  // Prefer explicit page props; otherwise use app-wide hydrated store (Trace/Usage/Setup).
  const effectiveSessionProjections =
    sessionProjections ??
    sessionProjectionsStore?.sessionProjections ??
    localSessionProjections;
  // Without the app-wide store (unit tests / isolated frames), empty means empty.
  const effectiveSessionsHydrated =
    sessionsHydrated ??
    sessionProjectionsStore?.sessionsHydrated ??
    true;
  const sessions = useMemo(
    () => getSessionProjectionListItems(effectiveSessionProjections),
    [effectiveSessionProjections],
  );
  const [localSelectedSessionId, setLocalSelectedSessionId] = useState<string | null>(
    () =>
      getSessionProjectionListItems(
        sessionProjections ??
          (shouldUseBrowserDevelopmentData()
            ? defaultSidebarProjectSessionProjections
            : []),
      )[0]?.id ?? null,
  );
  const effectiveSelectedSessionId =
    selectedSessionId === undefined ? localSelectedSessionId : selectedSessionId;
  const updateSelectedSessionId = onSelectedSessionIdChange ?? setLocalSelectedSessionId;
  const headerMainLeft = measuredSidebarWidth;
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

  useEffect(
    () => subscribeProjectRegistry(() => setProjects(getVisibleProjectRegistry())),
    [],
  );

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

    updateExpandedProjects((currentExpandedProjects) => {
      if (currentExpandedProjects[selectedProjection.projectId] === true) {
        return currentExpandedProjects;
      }

      return {
        ...currentExpandedProjects,
        [selectedProjection.projectId]: true,
      };
    });
  }, [effectiveSelectedSessionId, effectiveSessionProjections]);

  useLayoutEffect(() => {
    const root = layoutRef.current;
    if (!root) {
      return;
    }

    const sidebarPanel = root.querySelector<HTMLElement>(
      '[data-testid="app-layout-sidebar"]',
    );
    if (!sidebarPanel || typeof ResizeObserver === "undefined") {
      // Offcanvas closed state: the sidenav is not rendered at all.
      headerChromeRef.current?.style.setProperty("--pigui-main-left", "0px");
      return;
    }

    const updateSidebarWidth = () => {
      const width = sidebarPanel.getBoundingClientRect().width;

      if (!Number.isFinite(width) || width < 0) {
        return;
      }

      if (width === 0 && sidebarOpenRef.current && !sidebarAnimatingRef.current) {
        return;
      }

      const currentWidth = `${Math.round(width)}px`;

      // Keep the fixed header on the sidebar's live geometry so their motion cannot diverge.
      headerChromeRef.current?.style.setProperty("--pigui-main-left", currentWidth);

      if (width === 0 || sidebarAnimatingRef.current || !sidebarOpenRef.current) {
        return;
      }

      setMeasuredSidebarWidth(currentWidth);
    };

    updateSidebarWidth();

    const observer = new ResizeObserver(updateSidebarWidth);
    observer.observe(sidebarPanel);

    return () => {
      observer.disconnect();
    };
    // Re-observe on open/close: SideNav remounts its root when the resizable
    // wrapper is added/removed, which would leave a stale observed node.
  }, [sidebarOpen]);

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
  const handleNavigate = (to: string) => {
    void router.navigate({ to: to as never });
  };
  const handleNewSession = () => {
    openSessionDraft(null);
  };
  const handleNewProjectSession = (projectId: string) => {
    updateExpandedProjects((currentExpandedProjects) => ({
      ...currentExpandedProjects,
      [projectId]: true,
    }));
    openSessionDraft(projectId, projectId);
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

  const frameContent = (
    <>
      <HeaderChrome
        chromeRef={headerChromeRef}
        mainLeft={showSidebar ? headerMainLeft : "0px"}
        showSidebarToggle={showSidebar}
        sidebarOpen={showSidebar ? sidebarOpen : false}
        title={activeTab}
        toolbarActions={toolbarActions}
        onToggleSidebar={() => handleSidebarOpenChange(!sidebarOpen)}
      />
      <div
        className="flex h-full min-h-0 min-w-0 flex-col"
        data-testid="app-frame-content"
      >
        <div aria-hidden="true" className="h-10 shrink-0" />
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    </>
  );

  // Titlebar-only shell (first-run preflight): keep chrome, omit navigation sidebar.
  if (!showSidebar) {
    return (
      <div
        className="pigui-app-layout flex h-dvh min-h-0 flex-col bg-background text-foreground"
        data-testid="app-frame-titlebar-only"
      >
        {frameContent}
      </div>
    );
  }

  return (
    <AppShell
      ref={layoutRef}
      className="pigui-app-layout text-foreground"
      contentPadding={0}
      data-sidebar-animating={sidebarAnimating ? "true" : undefined}
      mobileNav={false}
      variant="elevated"
      sideNav={
        // Offcanvas on purpose: an Agentic Developer Environment has no use
        // for Astryx's 48px icon rail, so closed means fully removed.
        !sidebarOpen ? undefined : (
        <SideNav
          className="pigui-app-sidenav"
          data-state="expanded"
          data-testid="app-layout-sidebar"
          resizable={{ defaultWidth: 260, minWidth: 240, maxWidth: 320, autoSaveId: "pigui-app-shell" }}
          header={
            <div
              aria-hidden="true"
              data-testid="sidebar-titlebar-spacer"
              style={titlebarHeaderStyle}
            />
          }
          footer={<SystemNavigation pathname={pathname} onNavigate={handleNavigate} />}
        >
          <TraceUsageNavigation
            draftViewActive={draftViewActive}
            hasProjects={projects.length > 0}
            pathname={pathname}
            onNavigate={handleNavigate}
            onNewSession={handleNewSession}
          />
          <ProjectNavigation
            draftViewActive={draftViewActive}
            pathname={pathname}
            projects={projects}
            selectedSessionId={effectiveSelectedSessionId}
            sessions={sessions}
            sessionsHydrated={effectiveSessionsHydrated}
            expandedProjects={expandedProjects}
            onAddProject={handleAddProject}
            onToggleProject={handleToggleProject}
            onOpenSession={handleOpenSession}
            onNewProjectSession={handleNewProjectSession}
            onRenameProject={handleRenameProject}
            onRevealProject={handleRevealProject}
            onRemoveProject={handleRemoveProject}
          />
        </SideNav>
        )
      }
    >
      {frameContent}
    </AppShell>
  );
}
