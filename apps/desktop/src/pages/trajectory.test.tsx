import { render as renderView, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { TrajectoryIndexPage, TrajectoryWorkspace } from "@/pages/trajectory";

vi.mock("./session-list", () => ({
  SessionListPanel: ({ selectedSessionId }: { selectedSessionId?: string }) => (
    <div data-selected-session-id={selectedSessionId ?? ""} data-testid="mock-session-list" />
  ),
}));

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderView(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function renderTrajectoryWorkspace() {
  const rootRoute = createRootRoute({
    component: () => (
      <TrajectoryWorkspace selectedSessionId="session-a">
        <div data-testid="mock-trajectory-detail">Trajectory detail</div>
      </TrajectoryWorkspace>
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
    path: "/packages",
    component: () => null,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([indexRoute, sessionRoute, usageRoute, setupRoute]),
  });

  return render(<RouterProvider router={router} />);
}

function renderTrajectoryIndexPage() {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: TrajectoryIndexPage,
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
    path: "/packages",
    component: () => null,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
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

describe("TrajectoryWorkspace", () => {
  it("lays the trajectory out as a fixed-width sidebar finder and a fluid reading pane", async () => {
    const { container } = renderTrajectoryWorkspace();

    expect(await screen.findByTestId("mock-trajectory-detail")).toBeInTheDocument();
    expect(screen.getByTestId("mock-session-list")).toHaveAttribute(
      "data-selected-session-id",
      "session-a",
    );
    const trajectoryWorkspace = screen.getByTestId("trajectory-workspace");

    expect(trajectoryWorkspace).toHaveClass("h-full", "min-h-0", "overflow-hidden");

    const frame = screen.getByTestId("trajectory-split-view");
    expect(frame).toHaveClass("h-full", "min-h-0", "flex");
    // No resizer, no percentage split: the finder has a fixed budget.
    expect(frame.querySelector('[data-slot="resizable-handle"]')).not.toBeInTheDocument();

    const listPane = screen.getByTestId("trajectory-list-pane");
    expect(listPane).toHaveClass("w-80", "shrink-0", "border-r");
    const detailPane = screen.getByTestId("trajectory-detail-pane");
    expect(detailPane).toHaveClass("flex-1", "min-w-0", "min-h-0", "overflow-hidden");
    expect(container.querySelector('[role="main"]')).toBeInTheDocument();
  });

  it("frames trajectory replay as a first-level Trajectory surface", async () => {
    renderTrajectoryIndexPage();

    const detailPane = await screen.findByTestId("trajectory-detail-pane");

    expect(within(screen.getByTestId("trajectory-list-header")).getByRole("heading", { name: "Trajectory" })).toBeInTheDocument();
    expect(within(screen.getByTestId("trajectory-list-header")).getByRole("button", { name: "Refresh sessions" })).toBeInTheDocument();
    expect(within(detailPane).queryByText("Trajectory")).not.toBeInTheDocument();
    expect(screen.queryByText("Analyze / Trajectory")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Select a session" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-session-list")).toBeInTheDocument();
  });
});
