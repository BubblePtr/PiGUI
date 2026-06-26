import { render, screen, within } from "@testing-library/react";
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
import { beforeEach, describe, expect, it } from "vitest";
import { AppFrame } from "./app-shell";
import { saveSessionDraft } from "./session-drafts";

function renderAppFrame(
  path = "/",
  { toolbarActions }: { toolbarActions?: ReactNode } = {},
) {
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

describe("AppFrame", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("places Project sessions in the primary sidebar", async () => {
    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");
    const projectNavigation = within(projectGroup).getByLabelText("Pig project sessions");

    expect(within(projectGroup).getByText("Pig")).toBeInTheDocument();
    expect(within(projectNavigation).getByText("Agent Workspace shell")).toBeInTheDocument();
    expect(within(projectNavigation).getByText("Analyze boundary pass")).toBeInTheDocument();
    expect(within(projectNavigation).getByText("Active now")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Sessions" })).toBeInTheDocument();
  });

  it("shows New Session and Project plus entry points with a lightweight draft indicator", async () => {
    saveSessionDraft("pig", "Existing Project draft");

    renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const projectGroup = screen.getByTestId("sidebar-projects");
    const projectNavigation = within(projectGroup).getByLabelText("Pig project sessions");

    expect(
      within(projectGroup).getByRole("button", { name: "New Session for Pig" }),
    ).toBeInTheDocument();
    expect(within(projectNavigation).getByRole("row", { name: "New Session" })).toBeInTheDocument();
    expect(within(projectGroup).getAllByText("Draft")).toHaveLength(2);
    expect(within(projectNavigation).queryByText("Session Draft")).not.toBeInTheDocument();
  });

  it("renders Analyze as an expanded second-level sidebar menu", async () => {
    renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const analyzeNavigation = screen.getByLabelText("Analyze navigation");
    const analyzeItem = analyzeNavigation
      .querySelector('[data-key="Analyze"]')
      ?.querySelector('[data-slot="sidebar-menu-item-content"]');

    expect(within(analyzeNavigation).getByText("Analyze")).toBeInTheDocument();
    expect(within(analyzeNavigation).getByText("Trace")).toBeInTheDocument();
    expect(within(analyzeNavigation).getByText("Usage")).toBeInTheDocument();
    expect(analyzeItem).toHaveClass("min-w-0", "flex-1");
    expect(screen.getByRole("heading", { level: 1, name: "Analyze" })).toBeInTheDocument();
  });

  it("orders Analyze above a large Workspace area and pins Settings to the footer", async () => {
    const { container } = renderAppFrame("/projects/pig/sessions");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebarContent = container.querySelector('[data-slot="sidebar-content"]');
    const sidebarFooter = container.querySelector('[data-slot="sidebar-footer"]');
    const analyzeNavigation = screen.getByLabelText("Analyze navigation");
    const workspaceGroup = screen.getByTestId("sidebar-workspace");
    const projectGroup = screen.getByTestId("sidebar-projects");

    expect(sidebarContent).toBeInTheDocument();
    expect(sidebarFooter).toBeInTheDocument();
    expect(sidebarContent).toHaveClass("flex-1", "min-h-0");
    expect(workspaceGroup).toHaveClass("flex-1", "min-h-0", "overflow-y-auto");
    expect(within(workspaceGroup).getByText("Workspace")).toBeInTheDocument();
    expect(sidebarContent?.children[0]).toBe(
      analyzeNavigation.closest('[data-slot="sidebar-group"]'),
    );
    expect(sidebarContent?.children[1]).toBe(workspaceGroup);
    expect(projectGroup).toBe(workspaceGroup.querySelector('[data-testid="sidebar-projects"]'));
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
    expect(layout).toHaveClass("pig-app-layout");
    expect(layout).toHaveAttribute("data-scroll-mode", "content");
    expect(layout).toHaveAttribute("data-resizable");
    expect(sidebar).toBeInTheDocument();
    expect(sidebar).toHaveAttribute("data-collapsible", "offcanvas");
    expect(sidebar).toHaveAttribute("data-variant", "inset");
    const sidebarChrome = container.querySelector('[data-slot="sidebar-header"]');
    expect(sidebarChrome).toBeInTheDocument();
    expect(sidebarChrome).toHaveClass("shrink-0", "select-none");
    expect(sidebarChrome).toHaveStyle({ height: "40px" });
    const macTrafficSpace = sidebarChrome?.querySelector('[data-testid="mac-traffic-space"]');

    expect(macTrafficSpace).toBeInTheDocument();
    expect(macTrafficSpace).toHaveAttribute("data-tauri-drag-region");
    expect(sidebarChrome?.querySelector("[data-tauri-drag-region]")).toBeInTheDocument();
    const collapsedTrafficSpace = container.querySelector<HTMLElement>(
      '[data-testid="collapsed-traffic-space"]',
    );
    expect(collapsedTrafficSpace).toBeInTheDocument();
    expect(collapsedTrafficSpace).toHaveStyle({ width: "0px", marginRight: "-16px" });
    expect(container.querySelector('[data-slot="sidebar-content"]')).not.toHaveClass("pt-12");
    expect(container.querySelector('[data-slot="navbar"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-trigger"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="app-layout-menu-toggle"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-rail"]')).not.toBeInTheDocument();
    const resizeHandle = container.querySelector('[data-slot="resizable-handle"]');
    expect(resizeHandle).toBeInTheDocument();
    expect(resizeHandle).toHaveAttribute("aria-label", "Resize handle");
    expect(resizeHandle).toHaveAttribute("data-type", "line");
    const currentItems = Array.from(container.querySelectorAll('[data-current="true"]'));
    expect(currentItems.some((item) => item.textContent?.includes("Analyze"))).toBe(true);
    expect(currentItems.some((item) => item.textContent?.includes("Usage"))).toBe(true);
    expect(screen.getByRole("heading", { level: 1, name: "Analyze" })).toBeInTheDocument();
  });

  it("keeps titlebar controls on the native traffic-light center line", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();

    const navbar = container.querySelector('[data-slot="navbar"]');
    const navbarHeader = container.querySelector('[data-slot="navbar-header"]');
    const trigger = screen.getByRole("button", { name: "Toggle sidebar" });
    const brand = container.querySelector('[data-slot="navbar-brand"]');
    const heading = screen.getByRole("heading", { level: 1, name: "Analyze" });

    expect(navbar).toHaveStyle({ "--navbar-height": "40px" });
    expect(navbar).toHaveClass("bg-surface");
    expect(navbarHeader).toHaveClass("h-full", "items-center");
    expect(navbarHeader).not.toHaveClass("navbar__header--sm");
    expect(trigger).toHaveStyle({ width: "28px", height: "28px" });
    expect(brand).toHaveClass("h-7", "items-center");
    expect(heading).toHaveClass("leading-7");
  });

  it("uses only blank titlebar space as Tauri drag regions", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Toggle sidebar" });
    const heading = screen.getByRole("heading", { level: 1, name: "Analyze" });
    const brand = container.querySelector('[data-slot="navbar-brand"]');
    const navbarSpacer = container.querySelector('[data-slot="navbar-spacer"]');
    const macTrafficSpace = container.querySelector('[data-testid="mac-traffic-space"]');
    const dragRegions = container.querySelectorAll("[data-tauri-drag-region]");

    expect(dragRegions).toHaveLength(3);
    expect(macTrafficSpace).toHaveAttribute("data-tauri-drag-region");
    expect(navbarSpacer).toHaveAttribute("data-tauri-drag-region");
    expect(navbarSpacer).toHaveClass("h-full", "min-w-0", "flex-1", "select-none");
    expect(trigger).not.toHaveAttribute("data-tauri-drag-region");
    expect(brand).not.toHaveAttribute("data-tauri-drag-region");
    expect(heading).not.toHaveAttribute("data-tauri-drag-region");
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
    expect(navbarActions).not.toHaveAttribute("data-tauri-drag-region");
    expect(action).not.toHaveAttribute("data-tauri-drag-region");
    expect(container.querySelector('[data-slot="navbar-spacer"]')).toHaveAttribute(
      "data-tauri-drag-region",
    );
  });

  it("keeps the collapsed navbar title clear of native traffic lights", async () => {
    const user = userEvent.setup();
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const provider = container.querySelector('[data-slot="sidebar-provider"]');
    const sidebar = container.querySelector('[data-slot="sidebar"]');

    const expandedTrafficSpace = container.querySelector<HTMLElement>(
      '[data-testid="collapsed-traffic-space"]',
    );

    expect(expandedTrafficSpace).toBeInTheDocument();
    expect(expandedTrafficSpace).toHaveAttribute("data-state", "expanded");
    expect(expandedTrafficSpace).toHaveStyle({ width: "0px", marginRight: "-16px" });

    await user.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(provider).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");

    const collapsedTrafficSpace = container.querySelector<HTMLElement>(
      '[data-testid="collapsed-traffic-space"]',
    );
    const navbarHeader = container.querySelector('[data-slot="navbar-header"]');
    const trigger = container.querySelector('[data-slot="sidebar-trigger"]');
    const dragRegions = container.querySelectorAll("[data-tauri-drag-region]");

    expect(collapsedTrafficSpace).toBeInTheDocument();
    expect(collapsedTrafficSpace).toBe(expandedTrafficSpace);
    expect(collapsedTrafficSpace).toHaveAttribute("aria-hidden", "true");
    expect(collapsedTrafficSpace).toHaveAttribute("data-state", "collapsed");
    expect(collapsedTrafficSpace).toHaveStyle({
      marginRight: "0px",
      transition: "width 0.2s ease, margin-right 0.2s ease",
      width: "88px",
    });
    expect(collapsedTrafficSpace).not.toHaveAttribute("data-tauri-drag-region");
    expect(navbarHeader?.firstElementChild).toBe(collapsedTrafficSpace);
    expect(collapsedTrafficSpace?.nextElementSibling).toBe(trigger);
    expect(trigger).not.toHaveAttribute("data-tauri-drag-region");
    expect(dragRegions).toHaveLength(3);
  });

  it("collapses the inset sidebar with the navbar trigger", async () => {
    const user = userEvent.setup();
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebar = container.querySelector('[data-slot="sidebar"]');
    const provider = container.querySelector('[data-slot="sidebar-provider"]');

    expect(provider).toHaveAttribute("data-state", "expanded");
    expect(sidebar).toHaveAttribute("data-state", "expanded");

    await user.click(screen.getByRole("button", { name: "Toggle sidebar" }));

    expect(provider).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
  });

  it("keeps the desktop sidebar compact", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    const sidebar = container.querySelector<HTMLElement>('[data-slot="sidebar"]');
    const sidebarWrapper = container.querySelector<HTMLElement>(".sidebar__offcanvas-wrapper");
    const styles = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
    const source = readFileSync(join(process.cwd(), "src/app-shell.tsx"), "utf8");

    expect(sidebar).toHaveStyle({ "--sidebar-width": "18rem" });
    expect(sidebarWrapper).toBeInTheDocument();
    expect(styles).toContain(".pig-app-layout .sidebar__offcanvas-wrapper");
    expect(styles).toContain("--sidebar-width: 18rem;");
    expect(styles).toContain(".pig-app-layout[data-resizable] .sidebar__offcanvas-wrapper");
    expect(styles).toContain(".pig-app-layout[data-resizable] [data-slot=\"sidebar\"]");
    expect(styles).toContain("min-width: 100%;");
    expect(source).toContain('const sidebarDefaultSize = "18rem";');
    expect(source).toContain('const sidebarMinSize = "16rem";');
    expect(source).toContain('const sidebarMaxSize = "24rem";');
    expect(source).toContain("sidebarDefaultSize={sidebarDefaultSize}");
    expect(source).toContain("sidebarMinSize={sidebarMinSize}");
    expect(source).toContain("sidebarMaxSize={sidebarMaxSize}");
    expect(source).toContain("sidebarResizable");
  });

  it("hides the sidebar resize rail while preserving the resize handle", async () => {
    const { container } = renderAppFrame("/");
    const styles = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar-rail"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="resizable-handle"]')).toBeInTheDocument();
    expect(styles).toContain(
      ".pig-app-layout[data-resizable] [data-slot=\"resizable-handle\"]",
    );
    expect(styles).toContain("--resizable-handle-color: transparent;");
    expect(styles).toContain("--resizable-handle-color-hover: transparent;");
    expect(styles).toContain("--resizable-handle-color-active: transparent;");
    expect(styles).toContain("background-color: transparent;");
  });

  it("removes duplicate product identity from the shell chrome", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="navbar"]')).not.toHaveTextContent("Pig");
    expect(screen.queryByText("Pi flight recorder")).not.toBeInTheDocument();
  });

  it("uses the current section label as the content title", async () => {
    renderAppFrame("/sessions/session-a");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Analyze" })).toBeInTheDocument();
  });

  it("gives routed pages a fixed-height content slot", async () => {
    renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.getByTestId("app-frame-content")).toHaveClass("h-full", "min-h-0");
    expect(screen.getByTestId("app-frame-content")).not.toHaveClass("min-h-full");
    expect(screen.getByTestId("app-frame-content")).not.toHaveClass("bg-background");
  });

  it("styles the inset layout with a transparent sidebar and card-like content surface", () => {
    const source = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

    expect(source).toContain(".pig-app-layout [data-slot=\"app-layout-body\"]");
    expect(source).not.toContain(".pig-app-layout > [data-slot=\"app-layout-body\"]");
    expect(source).toContain(".pig-app-layout [data-slot=\"navbar\"]");
    expect(source).toContain("background-color: var(--pig-color-surface);");
    expect(source).toContain("border: 1px solid var(--pig-color-border);");
    expect(source).toContain("border-radius: calc(var(--radius) * 2);");
    expect(source).toContain("--pig-app-inset: calc(var(--spacing, 0.25rem) * 1);");
    expect(source).toContain("margin: 0 var(--pig-app-inset) 0 0;");
  });

  it("does not import standalone React Aria Heading into the app shell", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app-shell.tsx"),
      "utf8",
    );

    expect(source).not.toContain('react-aria-components/Heading');
    expect(source).not.toContain("<Sidebar.Mobile");
  });

  it("extends web content into the native macOS titlebar overlay", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
    );
    const [mainWindow] = config.app.windows;

    expect(mainWindow.label).toBe("main");
    expect(mainWindow.decorations).toBe(true);
    expect(mainWindow.titleBarStyle).toBe("Overlay");
    expect(mainWindow.hiddenTitle).toBe(true);
    expect(mainWindow.trafficLightPosition).toEqual({ x: 16, y: 22 });
  });

  it("does not replace macOS titlebar gestures with React window API handlers", () => {
    const source = readFileSync(join(process.cwd(), "src/app-shell.tsx"), "utf8");

    expect(source).not.toContain("startWindowDrag");
    expect(source).not.toContain("toggleWindowMaximize");
  });

  it("allows Tauri drag-region window commands for the main window", () => {
    const capability = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri/capabilities/default.json"), "utf8"),
    );

    expect(capability.windows).toEqual(["main"]);
    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:default",
        "core:window:allow-start-dragging",
        "core:window:allow-toggle-maximize",
      ]),
    );
  });
});
