import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { AppFrame } from "./app-shell";

function renderAppFrame(path = "/") {
  const rootRoute = createRootRoute({
    component: () => (
      <AppFrame sidebar={<div>Route sidebar</div>}>
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
  const setupRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/setup",
    component: () => null,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([indexRoute, sessionRoute, usageRoute, setupRoute]),
  });

  return render(<RouterProvider router={router} />);
}

describe("AppFrame", () => {
  it("uses HeroUI Pro AppLayout and keeps the sidebar to primary tabs only", async () => {
    const { container } = renderAppFrame("/usage");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.queryByText("Route sidebar")).not.toBeInTheDocument();
    const layout = container.querySelector("[data-app-layout]");
    const sidebar = container.querySelector('[data-slot="sidebar"]');

    expect(layout).toBeInTheDocument();
    expect(layout).toHaveClass("pig-app-layout");
    expect(layout).toHaveAttribute("data-scroll-mode", "content");
    expect(layout).not.toHaveAttribute("data-resizable");
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
    expect(container.querySelector('[data-slot="resizable-handle"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-current="true"]')).toHaveTextContent("Usage");
    expect(screen.getByRole("heading", { level: 1, name: "Usage" })).toBeInTheDocument();
  });

  it("keeps titlebar controls on the native traffic-light center line", async () => {
    const { container } = renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();

    const navbar = container.querySelector('[data-slot="navbar"]');
    const navbarHeader = container.querySelector('[data-slot="navbar-header"]');
    const trigger = screen.getByRole("button", { name: "Toggle sidebar" });
    const brand = container.querySelector('[data-slot="navbar-brand"]');
    const heading = screen.getByRole("heading", { level: 1, name: "Trace" });

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
    const heading = screen.getByRole("heading", { level: 1, name: "Trace" });
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
    expect(sidebar).toHaveStyle({ "--sidebar-width": "15rem" });
  });

  it("removes duplicate product identity from the shell chrome", async () => {
    renderAppFrame("/");

    expect(await screen.findByText("Main content")).toBeInTheDocument();
    expect(screen.queryByText("Pig")).not.toBeInTheDocument();
    expect(screen.queryByText("Pi flight recorder")).not.toBeInTheDocument();
  });

  it("uses the current tab label as the content title", async () => {
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

  it("styles the inset layout with a transparent sidebar and card-like content surface", () => {
    const source = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

    expect(source).toContain(".pig-app-layout > [data-slot=\"app-layout-body\"]");
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
