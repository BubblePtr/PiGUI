import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppFrame } from "@/app/app-shell";
import { addProjectToRegistry, getProjectRegistry } from "@/entities/project/project-registry";
import { saveFollowUpDraft } from "@/entities/session/follow-up-drafts";
import { getSessionDraft, saveSessionDraft } from "@/entities/session/session-drafts";
import type { PiGUIRendererApi } from "@/shared/runtime";

const pigProjectPath = "/Users/void/code/opensource/Pig";

function seedPigProject() {
  addProjectToRegistry(pigProjectPath, {
    now: () => "2026-06-30T08:00:00.000Z",
  });
}

function renderAppFrame(
  path = "/",
  {
    seedProjects = true,
    toolbarActions,
  }: { seedProjects?: boolean; toolbarActions?: ReactNode } = {},
) {
  if (seedProjects) {
    seedPigProject();
  }

  const rootRoute = createRootRoute({
    component: () => (
      <AppFrame sidebar={<div>Route sidebar</div>} toolbarActions={toolbarActions}>
        <div>Main content</div>
      </AppFrame>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const sessionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sessions/$sessionId",
    component: () => null,
  });
  const usageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/usage",
    component: () => null,
  });
  const projectSessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/projects/$projectId/sessions",
    component: () => null,
  });
  const setupRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
    component: () => null,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([
      indexRoute,
      sessionRoute,
      usageRoute,
      projectSessionsRoute,
      setupRoute,
    ]),
  });

  return render(<RouterProvider router={router} />);
}

function getProjectHeaderRow(projectGroup: HTMLElement, name: string) {
  const row = within(projectGroup)
    .getAllByRole("row")
    .find((candidate) => candidate.getAttribute("aria-label") === name);

  if (!row) {
    throw new Error(`Project header row not found: ${name}`);
  }

  return row;
}

function getProjectToggleButton(projectGroup: HTMLElement, name: string) {
  return within(getProjectHeaderRow(projectGroup, name)).getAllByRole("button")[0];
}

describe("AppFrame", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.pigui;
  });

  it("renders Empty Workspace State when the Project Registry is empty", async () => {
    renderAppFrame("/projects/pig/sessions", { seedProjects: false });

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");

    expect(within(projectGroup).getByRole("button", { name: "Add Project" })).toBeInTheDocument();
    expect(within(projectGroup).queryByPlaceholderText("Absolute local path")).not.toBeInTheDocument();
    expect(
      within(projectGroup).queryByRole("button", { name: "New Session for Pig" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Trace and usage navigation")).queryByRole("row", {
        name: "New Session",
      }),
    ).not.toBeInTheDocument();
    expect(within(projectGroup).queryByText("Pig")).not.toBeInTheDocument();
  });

  it("uses the native directory picker when adding a Project", async () => {
    const user = userEvent.setup();
    const invoke = vi.fn(async (command: string) => {
      if (command === "select_project_directory") {
        return "/Users/void/Documents/study";
      }

      return null;
    });

    window.pigui = {
      invoke: invoke as unknown as PiGUIRendererApi["invoke"],
      onBackendEvent: () => () => {},
      onWindowFocusChanged: () => () => {},
    };

    renderAppFrame("/projects/pig/sessions", { seedProjects: false });

    await user.click(await screen.findByRole("button", { name: "Add Project" }));

    expect(invoke).toHaveBeenCalledWith("select_project_directory", undefined);
    expect(await screen.findByText("study")).toBeInTheDocument();
    expect(getSessionDraft()).toMatchObject({
      projectId: "/Users/void/Documents/study",
      prompt: "",
    });
  });

  it("places Project sessions in the primary sidebar", async () => {
    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");
    const projectNavigation = within(projectGroup).getByLabelText("Pig project sessions");

    expect(within(projectGroup).getByText("Pig")).toBeInTheDocument();
    expect(within(projectNavigation).getByText("Agent Workspace shell")).not.toHaveAttribute(
      "data-pigui-session-title",
    );
    expect(within(projectNavigation).getByText("Trace boundary pass")).toBeInTheDocument();
    expect(within(projectNavigation).getByLabelText("Active run")).toBeInTheDocument();
    const activeTime = within(projectNavigation).getByText("08:06");

    expect(activeTime).toHaveClass("text-muted", "text-[10px]", "leading-none");
    expect(activeTime.closest('[data-slot="sidebar-menu-chip"]')).toBeInTheDocument();
    expect(activeTime.closest('[data-slot="sidebar-menu-actions"]')).toBeNull();
    const traceUsageNavigation = screen.getByLabelText("Trace and usage navigation");
    const topRows = within(traceUsageNavigation).getAllByRole("row");
    const globalNewSessionRow = within(traceUsageNavigation).getByRole("row", {
      name: "New Session",
    });
    const projectActionsButton = within(projectGroup).getByRole("button", {
      name: "Project actions for Pig",
    });

    expect(topRows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "New Session",
      "Trace",
      "Usage",
    ]);
    expect(globalNewSessionRow).not.toHaveAttribute("data-current", "true");
    expect(
      within(projectNavigation).queryByRole("row", { name: "New Session" }),
    ).not.toBeInTheDocument();
    expect(
      within(projectGroup).queryByRole("button", { name: "New Session for Pig" }),
    ).not.toBeInTheDocument();
    expect(projectActionsButton).toHaveAttribute("data-slot", "sidebar-menu-action");
    expect(projectActionsButton).toHaveClass("sidebar__menu-action");
    expect(projectActionsButton).not.toHaveClass("size-5", "size-6", "hover:bg-muted/10");
    expect(screen.getByRole("heading", { level: 1, name: "Sessions" })).toBeInTheDocument();
  });

  it("renders Project headers as sidebar menu items with menu actions", async () => {
    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");
    const projectHeader = within(projectGroup).getAllByRole("row").find((row) =>
      within(row).queryByText("Pig"),
    );

    expect(projectHeader).toBeDefined();
    expect(projectHeader).toHaveAttribute("data-slot", "sidebar-menu-item");
    expect(projectHeader?.querySelector('[data-slot="sidebar-menu-label"]')).toHaveTextContent(
      "Pig",
    );

    const projectActions = projectHeader?.querySelector('[data-slot="sidebar-menu-actions"]');
    const projectActionsButton = within(projectHeader as HTMLElement).getByRole("button", {
      name: "Project actions for Pig",
    });

    expect(projectActions).toBeInTheDocument();
    expect(projectActionsButton.closest('[data-slot="sidebar-menu-actions"]')).toBe(
      projectActions,
    );
    expect(projectActionsButton).toHaveAttribute("data-slot", "sidebar-menu-action");
    expect(
      within(projectHeader as HTMLElement).queryByRole("button", {
        name: "New Session for Pig",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses folder state icons for Project expansion and swaps to a chevron affordance on hover", async () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/app-shell.tsx"), "utf8");
    const iconSource = readFileSync(
      join(process.cwd(), "apps/desktop/src/shared/ui/icons.tsx"),
      "utf8",
    );
    const styles = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");

    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");
    const projectHeader = getProjectHeaderRow(projectGroup, "Pig");
    const projectToggle = within(projectHeader).getAllByRole("button")[0];

    expect(projectToggle).toHaveAttribute("data-slot", "sidebar-menu-trigger");
    expect(projectToggle.querySelector(".pigui-project-expansion-indicator")).toBeInTheDocument();
    expect(source).toContain("FolderClosed,");
    expect(source).toContain("FolderOpenState,");
    expect(source).toContain("ChevronRight,");
    expect(source).toContain("<ProjectExpansionIndicator expanded={expanded} />");
    expect(source).not.toContain("<Sidebar.MenuIndicator />");
    expect(iconSource).toContain("Folder01Icon");
    expect(iconSource).toContain("Folder02Icon");
    expect(iconSource).toContain("export const FolderClosed = iconComponent(Folder01Icon);");
    expect(iconSource).toContain("export const FolderOpenState = iconComponent(Folder02Icon);");
    expect(styles).toContain(".pigui-project-expansion-indicator__state");
    expect(styles).toContain(".pigui-project-expansion-indicator__chevron");
    expect(styles).toContain(":has(.sidebar__menu-trigger:focus-visible)");
    expect(styles).toContain(":has(.sidebar__menu-trigger[data-focus-visible=\"true\"])");
    expect(styles).toContain(".pigui-project-expansion-indicator__state");
    expect(styles).toContain("opacity: 0;");
    expect(styles).toContain(".pigui-project-expansion-indicator[data-expanded=\"true\"]");
    expect(styles).toContain("rotate: 90deg;");
  });

  it("renders the Project session list from active, unread, archive, and updated projection state", async () => {
    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectNavigation = within(screen.getByTestId("sidebar-projects")).getByLabelText(
      "Pig project sessions",
    );
    const sessionRows = within(projectNavigation).getAllByRole("row").slice(1);

    expect(
      sessionRows.map((row) =>
        row.querySelector('[data-slot="sidebar-menu-label"]')?.textContent?.trim(),
      ),
    ).toEqual([
      "Agent Workspace shell",
      "Trace boundary pass",
      "Usage evidence review",
    ]);
    expect(within(sessionRows[0]).getByLabelText("Active run")).toBeInTheDocument();
    expect(within(sessionRows[1]).getByLabelText("Unread result")).toBeInTheDocument();
    expect(within(projectNavigation).queryByText("Archived checkout snapshot")).not.toBeInTheDocument();
    expect(within(projectNavigation).queryByText(/Running|Completed|Failed|Waiting/)).not.toBeInTheDocument();
  });

  it("selects a Session without clearing unread before route content renders it", async () => {
    const user = userEvent.setup();

    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectNavigation = within(screen.getByTestId("sidebar-projects")).getByLabelText(
      "Pig project sessions",
    );
    const unreadRow = within(projectNavigation).getByRole("row", {
      name: "Trace boundary pass",
    });

    expect(within(unreadRow).getByLabelText("Unread result")).toBeInTheDocument();

    await user.click(unreadRow);

    const openedRow = within(projectNavigation).getByRole("row", {
      name: "Trace boundary pass",
    });

    expect(openedRow).toHaveAttribute("data-current", "true");
    expect(within(openedRow).getByLabelText("Unread result")).toBeInTheDocument();
    expect(within(projectNavigation).queryByText(/Completed|Failed|Waiting/)).not.toBeInTheDocument();
  });

  it("auto-expands the Project that owns an externally opened Session", async () => {
    window.localStorage.setItem(
      "pigui.projectSidebar.expanded.v1",
      JSON.stringify({ [pigProjectPath]: false }),
    );

    renderAppFrame("/projects/pig/sessions");

    const projectNavigation = await screen.findByLabelText("Pig project sessions");

    expect(
      within(projectNavigation).getByRole("row", { name: "Agent Workspace shell" }),
    ).toBeInTheDocument();
    expect(
      getProjectHeaderRow(screen.getByTestId("sidebar-projects"), "Pig"),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("lists registry Projects by addedAt and persists independent collapse state", async () => {
    const user = userEvent.setup();

    addProjectToRegistry(pigProjectPath, {
      now: () => "2026-06-30T08:00:00.000Z",
    });
    addProjectToRegistry("/Users/void/Documents/study", {
      now: () => "2026-06-30T09:00:00.000Z",
    });

    const firstRender = renderAppFrame("/projects/pig/sessions", { seedProjects: false });
    const projectGroup = await screen.findByTestId("sidebar-projects");

    expect(
      within(projectGroup)
        .getAllByRole("row")
        .filter((row) => ["study", "Pig"].includes(row.getAttribute("aria-label") ?? ""))
        .map((row) => row.getAttribute("aria-label")),
    ).toEqual(["study", "Pig"]);
    expect(screen.getByLabelText("study project sessions")).toBeInTheDocument();
    expect(screen.getByLabelText("Pig project sessions")).toBeInTheDocument();

    await user.click(getProjectToggleButton(projectGroup, "study"));

    expect(getProjectHeaderRow(projectGroup, "study")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Pig project sessions")).toBeInTheDocument();
    expect(screen.getByText("Main content")).toBeInTheDocument();

    firstRender.unmount();
    renderAppFrame("/projects/pig/sessions", { seedProjects: false });

    const restoredProjectGroup = await screen.findByTestId("sidebar-projects");

    expect(getProjectHeaderRow(restoredProjectGroup, "study")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByLabelText("Pig project sessions")).toBeInTheDocument();
  });

  it("opens the global New Session draft without adding Project draft rows", async () => {
    const user = userEvent.setup();

    saveSessionDraft(pigProjectPath, "Existing Project draft");

    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");
    const projectNavigation = within(projectGroup).getByLabelText("Pig project sessions");
    const traceUsageNavigation = screen.getByLabelText("Trace and usage navigation");
    const globalNewSessionRow = within(traceUsageNavigation).getByRole("row", {
      name: "New Session",
    });

    expect(
      within(projectGroup).queryByRole("button", { name: "New Session for Pig" }),
    ).not.toBeInTheDocument();
    expect(
      within(projectNavigation).queryByRole("row", { name: "New Session" }),
    ).not.toBeInTheDocument();
    expect(within(projectGroup).queryByText("Draft")).not.toBeInTheDocument();
    expect(within(projectNavigation).queryByText("Session Draft")).not.toBeInTheDocument();

    await user.click(globalNewSessionRow);

    expect(getSessionDraft()).toMatchObject({
      projectId: null,
      prompt: "Existing Project draft",
    });
    expect(within(traceUsageNavigation).getByRole("row", { name: "New Session" })).toHaveAttribute(
      "data-current",
      "true",
    );
  });

  it("shows Follow-up Draft indicators on Session rows and collapsed Projects", async () => {
    const user = userEvent.setup();

    saveFollowUpDraft("session-analyze-boundary", "Continue the trace review");

    renderAppFrame("/projects/pig/sessions");

    const projectGroup = await screen.findByTestId("sidebar-projects");
    const projectNavigation = within(projectGroup).getByLabelText("Pig project sessions");
    const sessionRow = within(projectNavigation).getByRole("row", {
      name: "Trace boundary pass",
    });

    expect(within(sessionRow).getByText("Draft")).toBeInTheDocument();

    await user.click(getProjectToggleButton(projectGroup, "Pig"));

    const projectHeader = getProjectHeaderRow(projectGroup, "Pig");

    expect(within(projectHeader).getByText("Draft")).toBeInTheDocument();
    expect(projectHeader).toHaveAttribute("aria-expanded", "false");
  });

  it("removes a Project from the sidebar after confirmation and clears only the draft target", async () => {
    const user = userEvent.setup();

    addProjectToRegistry(pigProjectPath, {
      now: () => "2026-06-30T08:00:00.000Z",
    });
    addProjectToRegistry("/Users/void/Documents/study", {
      now: () => "2026-06-30T09:00:00.000Z",
    });
    saveSessionDraft(pigProjectPath, "Keep this prompt");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderAppFrame("/projects/pig/sessions", { seedProjects: false });
    const projectGroup = await screen.findByTestId("sidebar-projects");

    await user.click(within(projectGroup).getByRole("button", { name: "Project actions for Pig" }));
    const projectActionsMenu = screen.getByRole("menu");
    const projectActionsPopover = projectActionsMenu.closest('[data-slot="dropdown-popover"]');
    const renameProjectItem = within(projectActionsMenu).getByRole("menuitem", {
      name: "Rename Project",
    });
    const revealProjectItem = within(projectActionsMenu).getByRole("menuitem", {
      name: "Reveal in Finder",
    });
    const removeProjectItem = within(projectActionsMenu).getByRole("menuitem", {
      name: "Remove Project...",
    });

    expect(projectActionsMenu).toHaveAttribute("data-slot", "dropdown-menu");
    expect(projectActionsPopover).toHaveClass("pigui-sidebar-action-dropdown__popover");
    expect(projectActionsMenu).toHaveClass("pigui-sidebar-action-dropdown__menu");
    expect(renameProjectItem).toHaveClass("pigui-sidebar-action-dropdown__item");
    expect(revealProjectItem).toHaveClass("pigui-sidebar-action-dropdown__item");
    expect(removeProjectItem).toHaveClass("pigui-sidebar-action-dropdown__item");
    expect(
      within(projectActionsMenu).getAllByRole("menuitem").map((item) => item.textContent?.trim()),
    ).toEqual(["Rename Project", "Reveal in Finder", "Remove Project..."]);
    await user.click(removeProjectItem);

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Remove Pig from PiGUI?"),
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Local files and historical Sessions will not be deleted."),
    );
    expect(within(projectGroup).queryByText("Pig")).not.toBeInTheDocument();
    expect(within(projectGroup).getByText("study")).toBeInTheDocument();
    expect(getSessionDraft()).toMatchObject({
      projectId: null,
      prompt: "Keep this prompt",
    });
  });

  it("renames a Project from the sidebar action menu", async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("PiGUI Desktop");

    renderAppFrame("/projects/pig/sessions");
    const projectGroup = await screen.findByTestId("sidebar-projects");

    await user.click(within(projectGroup).getByRole("button", { name: "Project actions for Pig" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename Project" }));

    expect(prompt).toHaveBeenCalledWith("Rename Project", "Pig");
    expect(within(projectGroup).queryByText("Pig")).not.toBeInTheDocument();
    expect(within(projectGroup).getByText("PiGUI Desktop")).toBeInTheDocument();
    expect(getProjectRegistry()[0]).toMatchObject({
      id: pigProjectPath,
      displayName: "PiGUI Desktop",
    });
  });

  it("reveals a Project in Finder from the sidebar action menu", async () => {
    const user = userEvent.setup();
    const invoke = vi.fn(async () => undefined);
    window.pigui = {
      invoke: invoke as unknown as PiGUIRendererApi["invoke"],
      onBackendEvent: () => () => {},
      onWindowFocusChanged: () => () => {},
    };

    renderAppFrame("/projects/pig/sessions");
    const projectGroup = await screen.findByTestId("sidebar-projects");

    await user.click(within(projectGroup).getByRole("button", { name: "Project actions for Pig" }));
    await user.click(screen.getByRole("menuitem", { name: "Reveal in Finder" }));

    expect(invoke).toHaveBeenCalledWith("reveal_project_in_finder", {
      path: pigProjectPath,
    });
  });

  it("renders Trace and Usage as first-level sidebar menu items", async () => {
    renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const traceUsageNavigation = screen.getByLabelText("Trace and usage navigation");
    const traceItem = within(traceUsageNavigation).getByRole("row", { name: "Trace" });
    const usageItem = within(traceUsageNavigation).getByRole("row", { name: "Usage" });

    expect(within(traceUsageNavigation).queryByText("Analyze")).not.toBeInTheDocument();
    expect(traceUsageNavigation.querySelector('[data-key="Analyze"]')).not.toBeInTheDocument();
    expect(traceItem).toHaveAttribute("data-current", "true");
    expect(usageItem).not.toHaveAttribute("data-current", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Trace" })).toBeInTheDocument();
  });

  it("orders Trace and Usage above Projects and pins Settings to the footer", async () => {
    const { container } = renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebarContent = container.querySelector('[data-slot="sidebar-content"]');
    const sidebarFooter = container.querySelector('[data-slot="sidebar-footer"]');
    const traceUsageNavigation = screen.getByLabelText("Trace and usage navigation");
    const projectGroup = screen.getByTestId("sidebar-projects");

    expect(sidebarContent).toBeInTheDocument();
    expect(sidebarFooter).toBeInTheDocument();
    expect(sidebarContent).toHaveClass("flex-1", "min-h-0");
    expect(projectGroup).toHaveClass("flex-1", "min-h-0", "overflow-y-auto");
    expect(within(projectGroup).getByText("Projects")).toBeInTheDocument();
    expect(within(projectGroup).getByRole("button", { name: "Add Project" })).toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-workspace")).not.toBeInTheDocument();
    expect(sidebarContent?.children[0]).toBe(
      traceUsageNavigation.closest('[data-slot="sidebar-group"]'),
    );
    expect(sidebarContent?.children[1]).toBe(projectGroup);
    expect(sidebarFooter).toHaveTextContent("Settings");
    expect(sidebarFooter).not.toHaveTextContent("Analyze");
    expect(sidebarContent).not.toHaveTextContent("Settings");
  });

  it("uses HeroUI Pro AppLayout and keeps the sidebar to primary tabs only", async () => {
    const { container } = renderAppFrame("/usage");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.queryByText("Route sidebar")).not.toBeInTheDocument();
    const layout = container.querySelector("[data-app-layout]");
    const sidebar = container.querySelector('[data-slot="sidebar"]');

    expect(layout).toBeInTheDocument();
    expect(layout).toHaveClass("pigui-app-layout");
    expect(layout).toHaveAttribute("data-scroll-mode", "content");
    expect(layout).toHaveAttribute("data-resizable");
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveAttribute("data-collapsible", "offcanvas");
    expect(sidebar).toHaveAttribute("data-variant", "inset");
    expect(sidebar).toHaveStyle({ "--sidebar-width": "260px" });
    expect(sidebar).not.toHaveStyle({ "--spacing": "0.20rem" });
    const sidebarChrome = screen.getByTestId("sidebar-titlebar-spacer");
    expect(sidebarChrome).toBeInTheDocument();
    expect(sidebarChrome).toHaveStyle({ height: "40px" });
    expect(within(sidebarChrome).queryByRole("button")).not.toBeInTheDocument();

    const headerChrome = screen.getByTestId("header-chrome");
    expect(headerChrome).toBeInTheDocument();
    expect(headerChrome).toHaveClass("pigui-header-chrome");
    expect(headerChrome).toHaveStyle({
      "--pigui-header-height": "40px",
      "--pigui-main-left": "260px",
      "--pigui-traffic-width": "88px",
    });
    const macTrafficSpace = within(headerChrome).getByTestId("mac-traffic-space");

    expect(macTrafficSpace).toBeInTheDocument();
    expect(macTrafficSpace).toHaveAttribute("data-window-drag-region");
    expect(headerChrome.querySelector("[data-window-drag-region]")).toBeInTheDocument();
    const sidebarCollapseTrigger = within(headerChrome).getByRole("button", {
      name: "Collapse sidebar",
    });
    expect(sidebarCollapseTrigger).toHaveAttribute("data-slot", "sidebar-trigger");
    expect(container.querySelector('[data-testid="collapsed-traffic-space"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-content"]')).not.toHaveClass("pt-12");
    expect(container.querySelector('[data-slot="navbar"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="app-layout-menu-toggle"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-rail"]')).not.toBeInTheDocument();
    const resizeHandle = container.querySelector('[data-slot="resizable-handle"]');
    expect(resizeHandle).toBeInTheDocument();
    expect(resizeHandle).toHaveAttribute("aria-label", "Resize handle");
    expect(resizeHandle).toHaveAttribute("data-type", "line");
    const currentItems = Array.from(container.querySelectorAll('[data-current="true"]'));
    expect(currentItems.some((item) => item.textContent?.includes("Usage"))).toBe(true);
    expect(currentItems.some((item) => item.textContent?.includes("Analyze"))).toBe(false);
    expect(screen.getByRole("heading", { level: 1, name: "Usage" })).toBeInTheDocument();
  });

  it("keeps titlebar controls on the native traffic-light center line", async () => {
    const { container } = renderAppFrame("/");
    const mainSource = readFileSync(join(process.cwd(), "apps/desktop/electron/main.ts"), "utf8");

    expect(await screen.findByText("Main content")).toBeInTheDocument();

    const headerChrome = screen.getByTestId("header-chrome");
    const titleTrack = screen.getByTestId("header-chrome-title-track");
    const title = screen.getByTestId("header-chrome-title");
    const trigger = screen.getByRole("button", { name: "Collapse sidebar" });
    const heading = screen.getByRole("heading", { level: 1, name: "Trace" });

    expect(container.querySelector('[data-slot="navbar"]')).not.toBeInTheDocument();
    const headerHeight = Number.parseInt(
      headerChrome.style.getPropertyValue("--pigui-header-height"),
      10,
    );

    expect(headerChrome).toHaveStyle({ height: "40px" });
    expect(mainSource).toContain("trafficLightPosition: { x: 16, y: 13 }");
    expect(13).toBe((headerHeight - 14) / 2);
    expect(titleTrack).toHaveStyle({ "--pigui-main-left": "260px" });
    expect(titleTrack).toHaveStyle({ "--pigui-title-x": "260px" });
    expect(titleTrack).toHaveStyle({ left: "var(--pigui-chrome-safe-left)" });
    expect(title).toHaveStyle({
      "--pigui-title-x": "260px",
      transform: "translateX(calc(260px - var(--pigui-chrome-safe-left)))",
    });
    expect(trigger).toHaveStyle({ width: "28px", height: "28px" });
    expect(screen.getByTestId("header-chrome-left")).toHaveClass("pigui-header-chrome__left");
    expect(title).toHaveClass("h-7", "items-center");
    expect(heading).toHaveClass("leading-7");
  });

  it("uses state-specific Hugeicons glyphs for the fixed header sidebar trigger", async () => {
    const user = userEvent.setup();
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/app-shell.tsx"), "utf8");
    const iconSource = readFileSync(
      join(process.cwd(), "apps/desktop/src/shared/ui/icons.tsx"),
      "utf8",
    );

    renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const headerChrome = screen.getByTestId("header-chrome");
    const trigger = within(headerChrome).getByRole("button", { name: "Collapse sidebar" });

    expect(trigger).toHaveAttribute("data-slot", "sidebar-trigger");
    await user.click(trigger);
    expect(within(headerChrome).getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(source).toContain("LayoutAlignLeft,");
    expect(source).toContain("SidebarLeft,");
    expect(source).toContain("function SidebarToggleIcon({ sidebarOpen }: { sidebarOpen: boolean })");
    expect(source).toContain("const Icon = sidebarOpen ? SidebarLeft : LayoutAlignLeft;");
    expect(source).toContain("<SidebarToggleIcon sidebarOpen={sidebarOpen} />");
    expect(source).not.toContain('<SidebarLeft aria-hidden="true" className="size-4" />');
    expect(source).not.toContain('style={titlebarControlStyle}\n        />');
    expect(iconSource).toContain("LayoutAlignLeftIcon");
    expect(iconSource).toContain("export const LayoutAlignLeft = iconComponent(LayoutAlignLeftIcon);");
    expect(iconSource).toContain("SidebarLeftIcon");
    expect(iconSource).toContain("export const SidebarLeft = iconComponent(SidebarLeftIcon);");
  });

  it("uses only blank titlebar space as window drag regions", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Collapse sidebar" });
    const heading = screen.getByRole("heading", { level: 1, name: "Trace" });
    const title = screen.getByTestId("header-chrome-title");
    const navbarSpacer = container.querySelector('[data-slot="navbar-spacer"]');
    const macTrafficSpace = within(screen.getByTestId("header-chrome")).getByTestId(
      "mac-traffic-space",
    );
    const dragRegions = container.querySelectorAll("[data-window-drag-region]");

    expect(dragRegions).toHaveLength(3);
    expect(macTrafficSpace).toHaveAttribute("data-window-drag-region");
    expect(navbarSpacer).toHaveAttribute("data-window-drag-region");
    expect(navbarSpacer).toHaveClass("h-full", "min-w-0", "flex-1", "select-none");
    expect(screen.getByTestId("header-chrome-title-track")).toHaveStyle({
      left: "var(--pigui-chrome-safe-left)",
    });
    expect(trigger).not.toHaveAttribute("data-window-drag-region");
    expect(title).not.toHaveAttribute("data-window-drag-region");
    expect(heading).not.toHaveAttribute("data-window-drag-region");
    expect(heading).toHaveClass("select-none");
  });

  it("renders route toolbar actions outside the titlebar drag region", async () => {
    const { container } = renderAppFrame("/projects/pig/sessions", {
      toolbarActions: <button type="button">Session actions</button>,
    });

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const navbarActions = screen.getByTestId("navbar-actions");
    const action = within(navbarActions).getByRole("button", {
      name: "Session actions",
    });

    expect(navbarActions).toBeInTheDocument();
    expect(action).toBeInTheDocument();
    expect(navbarActions).not.toHaveAttribute("data-window-drag-region");
    expect(action).not.toHaveAttribute("data-window-drag-region");
    expect(container.querySelector('[data-slot="navbar-spacer"]')).toHaveAttribute(
      "data-window-drag-region",
    );
    expect(container.querySelector('[data-slot="navbar"]')).not.toBeInTheDocument();
  });

  it("keeps the collapsed navbar title clear of native traffic lights", async () => {
    const user = userEvent.setup();
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const provider = container.querySelector('[data-slot="sidebar-provider"]');
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    const styles = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");
    const headerChrome = screen.getByTestId("header-chrome");
    const titleTrack = screen.getByTestId("header-chrome-title-track");
    const title = screen.getByTestId("header-chrome-title");
    const fixedTrigger = within(headerChrome).getByRole("button", {
      name: "Collapse sidebar",
    });

    expect(container.querySelector('[data-testid="collapsed-traffic-space"]')).not.toBeInTheDocument();
    expect(headerChrome).toHaveStyle({ "--pigui-main-left": "260px" });
    expect(titleTrack).toHaveStyle({ "--pigui-main-left": "260px" });
    expect(titleTrack).toHaveStyle({ "--pigui-title-x": "260px" });
    expect(titleTrack).toHaveStyle({ left: "var(--pigui-chrome-safe-left)" });
    expect(title).toHaveStyle({
      "--pigui-title-x": "260px",
      transform: "translateX(calc(260px - var(--pigui-chrome-safe-left)))",
    });

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(provider).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");

    const collapsedTrigger = within(headerChrome).getByRole("button", {
      name: "Expand sidebar",
    });
    const dragRegions = container.querySelectorAll("[data-window-drag-region]");

    expect(collapsedTrigger).toBe(fixedTrigger);
    expect(headerChrome).toHaveStyle({ "--pigui-main-left": "0px" });
    expect(titleTrack).toHaveStyle({ "--pigui-main-left": "0px" });
    expect(titleTrack).toHaveStyle({ left: "var(--pigui-chrome-safe-left)" });
    expect(titleTrack).toHaveStyle({ "--pigui-title-x": "132px" });
    expect(title).toHaveStyle({
      "--pigui-title-x": "132px",
      transform: "translateX(calc(132px - var(--pigui-chrome-safe-left)))",
    });
    expect(styles).not.toContain("collapsed-traffic-space");
    expect(styles).not.toContain("left: max(var(--pigui-main-left)");
    expect(styles).not.toContain("padding-left 200ms cubic-bezier(.2, .8, .2, 1)");
    expect(styles).not.toContain("padding-left: calc(var(--pigui-title-safe-offset)");
    expect(styles).not.toContain("transition: left 200ms cubic-bezier(.2, .8, .2, 1);");
    expect(styles).toContain("transform 200ms cubic-bezier(.2, .8, .2, 1)");
    expect(styles).toContain(".pigui-header-chrome__left {\n  position: absolute;");
    expect(styles).toContain("z-index: 1;");
    expect(styles).toContain(".pigui-header-chrome__title-track {\n  position: absolute;");
    expect(styles).toContain("z-index: 0;");
    expect(collapsedTrigger).not.toHaveAttribute("data-window-drag-region");
    expect(dragRegions).toHaveLength(3);
  });

  it("does not use transient collapsed resize widths for the title expand target", async () => {
    const originalResizeObserver = globalThis.ResizeObserver;
    const resizeObservers: Array<{ trigger: () => void }> = [];

    class TestResizeObserver {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeObservers.push({
          trigger: () => this.callback([], this as unknown as ResizeObserver),
        });
      }

      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
      writable: true,
    });

    try {
      const user = userEvent.setup();
      const { container } = renderAppFrame("/");

      expect(await screen.findByText("Main content")).toBeInTheDocument();
      const sidebarPanel = container.querySelector<HTMLElement>(
        '[data-testid="app-layout-sidebar"][data-panel]',
      );
      const title = screen.getByTestId("header-chrome-title");

      expect(sidebarPanel).toBeInTheDocument();
      if (!sidebarPanel) {
        throw new Error("Expected AppLayout sidebar panel to be rendered");
      }

      let measuredWidth = 224;
      sidebarPanel.getBoundingClientRect = () =>
        ({
          bottom: 0,
          height: 0,
          left: 0,
          right: measuredWidth,
          top: 0,
          width: measuredWidth,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;

      await act(async () => {
        resizeObservers.forEach((observer) => observer.trigger());
      });

      expect(title).toHaveStyle({
        "--pigui-title-x": "224px",
        transform: "translateX(calc(224px - var(--pigui-chrome-safe-left)))",
      });

      await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      expect(title).toHaveStyle({
        "--pigui-title-x": "132px",
        transform: "translateX(calc(132px - var(--pigui-chrome-safe-left)))",
      });

      measuredWidth = 12;
      await act(async () => {
        resizeObservers.forEach((observer) => observer.trigger());
      });

      await user.click(screen.getByRole("button", { name: "Expand sidebar" }));

      expect(title).toHaveStyle({
        "--pigui-title-x": "224px",
        transform: "translateX(calc(224px - var(--pigui-chrome-safe-left)))",
      });
    } finally {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: originalResizeObserver,
        writable: true,
      });
    }
  });

  it("collapses and reopens the inset sidebar with the fixed header chrome trigger", async () => {
    const user = userEvent.setup();
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    const provider = container.querySelector('[data-slot="sidebar-provider"]');
    const layout = container.querySelector("[data-app-layout]");
    const headerChrome = screen.getByTestId("header-chrome");
    const styles = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");

    expect(provider).toHaveAttribute("data-state", "expanded");
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(within(headerChrome).queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument();

    await user.click(
      within(headerChrome).getByRole("button", {
        name: "Collapse sidebar",
      }),
    );

    expect(provider).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(layout).toHaveAttribute("data-sidebar-animating", "true");
    const expandTrigger = within(headerChrome).getByRole("button", {
      name: "Expand sidebar",
    });
    expect(expandTrigger).toHaveAttribute("data-slot", "sidebar-trigger");
    expect(styles).toContain(
      '.pigui-app-layout[data-sidebar-animating="true"] [data-testid="app-layout-sidebar"][data-panel]',
    );
    expect(styles).toContain("flex-grow 200ms ease");
    expect(styles).toContain(
      '.pigui-app-layout[data-sidebar-animating="true"] [data-slot="sidebar"][data-collapsible="offcanvas"]',
    );
    expect(styles).toContain("translate 200ms ease");
    expect(styles).toContain("visibility 200ms");

    await user.click(expandTrigger);

    expect(provider).toHaveAttribute("data-state", "expanded");
    expect(sidebar).toHaveAttribute("data-state", "expanded");
    expect(
      within(headerChrome).getByRole("button", {
        name: "Collapse sidebar",
      }),
    ).toHaveAttribute("data-slot", "sidebar-trigger");
    expect(within(headerChrome).queryByRole("button", { name: "Expand sidebar" })).not.toBeInTheDocument();
  });

  it("keeps the desktop sidebar compact", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]');
    const sidebarWrapper = container.querySelector<HTMLElement>(".sidebar__offcanvas-wrapper");
    const styles = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/app-shell.tsx"), "utf8");

    expect(sidebar).toHaveStyle({ "--sidebar-width": "260px" });
    expect(sidebar).not.toHaveStyle({ "--spacing": "0.20rem" });
    expect(sidebarWrapper).toBeInTheDocument();
    expect(styles).toContain("--pigui-sidebar-row-height: 1.875rem;");
    expect(styles).toContain("--pigui-sidebar-row-gap: 0.125rem;");
    expect(styles).toContain("--pigui-sidebar-row-icon-gap: 0.625rem;");
    expect(styles).toContain("--pigui-sidebar-icon-size: 1rem;");
    expect(styles).toContain(".pigui-app-layout .sidebar__offcanvas-wrapper");
    expect(styles).toContain("--sidebar-width: 260px;");
    expect(styles).toContain(".pigui-app-layout .sidebar__content");
    expect(styles).toContain("padding-inline: var(--pigui-sidebar-content-padding-x);");
    expect(styles).toContain(".pigui-app-layout .sidebar__menu {");
    expect(styles).toContain("--sidebar-menu-indent: var(--pigui-sidebar-indent);");
    expect(styles).toContain("--sidebar-menu-row-gap: var(--pigui-sidebar-row-gap);");
    expect(styles).toContain("gap: var(--pigui-sidebar-row-gap);");
    expect(styles).toContain(".pigui-app-layout[data-resizable] .sidebar__offcanvas-wrapper");
    expect(styles).toContain(".pigui-app-layout[data-resizable] [data-slot=\"sidebar\"]");
    expect(styles).toContain("min-width: 100%;");
    expect(styles).not.toContain(".pigui-app-layout .sidebar__group + .sidebar__group");
    expect(styles).toContain(".pigui-app-layout .sidebar__menu-item-content");
    expect(styles).toContain("min-height: var(--pigui-sidebar-row-height);");
    expect(styles).toContain("gap: var(--pigui-sidebar-row-icon-gap);");
    expect(styles).toContain("padding-block: var(--pigui-sidebar-row-padding-y);");
    expect(styles).toContain("border-radius: var(--pigui-sidebar-item-radius);");
    expect(styles).toContain(".pigui-app-layout .sidebar__menu-icon svg");
    expect(styles).toContain(".pigui-app-layout .sidebar__menu-action svg");
    expect(styles).toContain("width: var(--pigui-sidebar-icon-size);");
    expect(styles).toContain("height: var(--pigui-sidebar-icon-size);");
    expect(styles).not.toContain(".pigui-app-layout .sidebar__menu-item:hover .sidebar__menu-item-content");
    expect(styles).not.toContain("border-radius: var(--radius, 0.5rem);");
    expect(styles).not.toContain("box-shadow: none;");
    expect(source).toContain('const sidebarDefaultSize = "260px";');
    expect(source).toContain('const sidebarMinSize = "240px";');
    expect(source).toContain('const sidebarMaxSize = "320px";');
    expect(source).not.toContain('"--spacing"');
    expect(source).toContain("<Sidebar.MenuTrigger>");
    expect(source).toContain("<Sidebar.Submenu>");
    expect(source).toContain("<SidebarActionDropdown");
    expect(source).toContain("<SidebarActionDropdownItem");
    expect(source).not.toContain("min-w-40");
    expect(source).not.toContain('role="menu"');
    expect(source).not.toContain('role="menuitem"');
    expect(source).not.toContain("absolute right-0 top-7");
    expect(source).toContain('resizableAutoSaveId="pigui-app-shell"');
    expect(source).not.toContain('resizableAutoSaveId="pig-app-shell"');
    expect(source).toContain("sidebarDefaultSize={sidebarDefaultSize}");
    expect(source).toContain("sidebarMinSize={sidebarMinSize}");
    expect(source).toContain("sidebarMaxSize={sidebarMaxSize}");
    expect(source).toContain("sidebarResizable");
  });

  it("uses the default resizable separator line", async () => {
    const { container } = renderAppFrame("/");
    const styles = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-rail"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="resizable-handle"]')).toBeInTheDocument();
    expect(styles).not.toContain(
      ".pigui-app-layout[data-resizable] [data-slot=\"resizable-handle\"]",
    );
    expect(styles).not.toContain("--resizable-handle-color: transparent;");
    expect(styles).not.toContain("--resizable-handle-color-hover: transparent;");
    expect(styles).not.toContain("--resizable-handle-color-active: transparent;");
  });

  it("removes duplicate product identity from the shell chrome", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="navbar"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("header-chrome-title")).not.toHaveTextContent("Pig");
    expect(screen.queryByText("Pi flight recorder")).not.toBeInTheDocument();
  });

  it("uses the current section label as the content title", async () => {
    renderAppFrame("/sessions/session-a");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Trace" })).toBeInTheDocument();
  });

  it("gives routed pages a fixed-height content slot", async () => {
    renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.getByTestId("app-frame-content")).toHaveClass("h-full", "min-h-0");
    expect(screen.getByTestId("app-frame-content")).not.toHaveClass("min-h-full");
    expect(screen.getByTestId("app-frame-content")).not.toHaveClass("bg-background");
  });

  it("disables document-level elastic overscroll", () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");

    expect(source).toContain("html,");
    expect(source).toContain("body,");
    expect(source).toContain("#root");
    expect(source).toContain("overscroll-behavior: none;");
    expect(source).toContain("overflow: hidden;");
    expect(source).toContain(".pigui-app-layout[data-scroll-mode=\"content\"] .app-layout__main");
  });

  it("lets AppLayout own the right content column surface", () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");

    expect(source).not.toContain(".pigui-app-layout [data-slot=\"app-layout-body\"]");
    expect(source).not.toContain(".pigui-app-layout > [data-slot=\"app-layout-body\"]");
    expect(source).not.toContain("border: 1px solid var(--border);");
    expect(source).not.toContain("box-shadow: var(--surface-shadow);");
    expect(source).not.toContain("--pigui-color-");
    expect(source).not.toContain("border-radius: calc(var(--radius) * 2);");
    expect(source).not.toContain("margin: 0 calc(var(--spacing, 0.25rem) * 1) 0 0;");
  });

  it("uses compact styling for sidebar action dropdowns", () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");
    const dropdownSource = readFileSync(
      join(process.cwd(), "apps/desktop/src/app/sidebar-action-dropdown.tsx"),
      "utf8",
    );
    const appShellSource = readFileSync(
      join(process.cwd(), "apps/desktop/src/app/app-shell.tsx"),
      "utf8",
    );
    const themeRootBlock = source.match(
      /:root,\n\.light,\n\.default,\n\[data-theme="light"\],\n\[data-theme="default"\] \{(?<body>[\s\S]*?)\n\}/,
    )?.groups?.body;

    expect(source).toContain("--pigui-sidebar-item-radius:");
    expect(themeRootBlock).toContain("--pigui-sidebar-dropdown-min-width: 9.5rem;");
    expect(themeRootBlock).toContain("--pigui-sidebar-dropdown-icon-size: 0.875rem;");
    expect(source).not.toContain(".pigui-app-layout {\n  --pigui-sidebar-content-padding-x:");
    expect(source).toContain("--pigui-sidebar-dropdown-min-width: 9.5rem;");
    expect(source).toContain("--pigui-sidebar-dropdown-max-width: 14rem;");
    expect(source).toContain("--pigui-sidebar-dropdown-padding: 0.25rem;");
    expect(source).toContain("--pigui-sidebar-dropdown-menu-gap: var(--pigui-sidebar-row-gap);");
    expect(source).toContain("--pigui-sidebar-dropdown-item-height: 1.75rem;");
    expect(source).toContain("--pigui-sidebar-dropdown-item-gap: 0.5rem;");
    expect(source).toContain("--pigui-sidebar-dropdown-item-padding-x: 0.5rem;");
    expect(source).toContain("--pigui-sidebar-dropdown-item-padding-y: 0.25rem;");
    expect(source).toContain("--pigui-sidebar-dropdown-icon-size: 0.875rem;");
    expect(source).toContain("--pigui-sidebar-dropdown-label-line-height: 1.25rem;");
    expect(source).toContain(".pigui-app-layout .sidebar__menu-item");
    expect(source).toContain("border-radius: var(--pigui-sidebar-item-radius);");
    expect(source).toContain(".pigui-sidebar-action-dropdown__trigger");
    expect(source).toContain(".pigui-sidebar-action-dropdown__popover");
    expect(source).toContain("min-width: var(--pigui-sidebar-dropdown-min-width);");
    expect(source).toContain("max-width: var(--pigui-sidebar-dropdown-max-width);");
    expect(source).toContain("border: 1px solid var(--separator);");
    expect(source).not.toContain("border: 0;");
    expect(source).toContain("border-radius: var(--pigui-sidebar-item-radius);");
    expect(source).toContain("box-shadow: 0 4px 14px 0 rgba(24, 24, 27, 0.10);");
    expect(source).toContain("gap: var(--pigui-sidebar-dropdown-menu-gap);");
    expect(source).toContain("padding: var(--pigui-sidebar-dropdown-padding);");
    expect(source).toContain(".pigui-sidebar-action-dropdown__popover [data-slot=\"menu-item\"]");
    expect(source).toContain("min-height: var(--pigui-sidebar-dropdown-item-height);");
    expect(source).toContain("gap: var(--pigui-sidebar-dropdown-item-gap);");
    expect(source).toContain("padding: var(--pigui-sidebar-dropdown-item-padding-y) var(--pigui-sidebar-dropdown-item-padding-x);");
    expect(source).toContain(".pigui-sidebar-action-dropdown__item-icon");
    expect(source).toContain("width: var(--pigui-sidebar-dropdown-icon-size);");
    expect(source).toContain("height: var(--pigui-sidebar-dropdown-icon-size);");
    expect(source).toContain("line-height: var(--pigui-sidebar-dropdown-label-line-height);");
    expect(source).not.toContain("border-radius: calc(var(--radius) * 0.75);");
    expect(dropdownSource).toContain('className="pigui-sidebar-action-dropdown__item-content"');
    expect(dropdownSource).toContain('className="pigui-sidebar-action-dropdown__item-icon"');
    expect(dropdownSource).not.toContain("gap-2");
    expect(dropdownSource).not.toContain("size-3.5");
    expect(dropdownSource).not.toContain("sidebarActionDropdownIconSlotClassName");
    expect(appShellSource).not.toContain("sidebarActionDropdownIconClassName");
    expect(appShellSource).toContain("<Pencil");
    expect(appShellSource).toContain("<FolderOpen");
    expect(appShellSource).toContain("<Trash2");
    expect(appShellSource.match(/className="size-3.5"/g)).toBeNull();
  });

  it("keeps inactive sidebar menu text and icons at normal foreground color", () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");

    expect(source).toContain(
      '.pigui-app-layout [data-slot="sidebar-menu-item"]:not([data-disabled="true"]) [data-slot="sidebar-menu-label"]',
    );
    expect(source).toContain(
      '.pigui-app-layout [data-slot="sidebar-menu-item"]:not([data-disabled="true"]) [data-slot="sidebar-menu-icon"]',
    );
    expect(source).toContain("color: var(--foreground);");
  });

  it("keeps primary sidebar navigation icons at the default compact size", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/desktop/src/app/app-shell.tsx"),
      "utf8",
    );

    expect(source).not.toContain("sidebarNavigationIconSlotClassName");
    expect(source).not.toContain("sidebarNavigationIconClassName");
    expect(source).not.toContain("size-[1.125rem]");
    expect(source).toContain('<ChatAdd className="size-4" />');
    expect(source.split('<Icon className="size-4" />')).toHaveLength(3);
  });

  it("does not import standalone React Aria Heading into the app shell", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/desktop/src/app/app-shell.tsx"),
      "utf8",
    );

    expect(source).not.toContain('react-aria-components/Heading');
    expect(source).not.toContain("<Sidebar.Mobile");
  });

  it("extends web content into the native macOS titlebar overlay", () => {
    const mainSource = readFileSync(join(process.cwd(), "apps/desktop/electron/main.ts"), "utf8");

    expect(mainSource).toContain('titleBarStyle: "hidden"');
    expect(mainSource).toContain("trafficLightPosition: { x: 16, y: 13 }");
    expect(mainSource).toContain("width: 960");
    expect(mainSource).toContain("height: 720");
  });

  it("does not replace macOS titlebar gestures with React window API handlers", () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/app-shell.tsx"), "utf8");

    expect(source).not.toContain("startWindowDrag");
    expect(source).not.toContain("toggleWindowMaximize");
  });

  it("marks Electron drag regions with app-region CSS instead of renderer window commands", () => {
    const styles = readFileSync(join(process.cwd(), "apps/desktop/src/app/styles.css"), "utf8");
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/app/app-shell.tsx"), "utf8");

    expect(styles).toContain("-webkit-app-region: drag;");
    expect(styles).toContain("-webkit-app-region: no-drag;");
    expect(source).not.toContain("startWindowDrag");
    expect(source).not.toContain("toggleWindowMaximize");
  });
});
