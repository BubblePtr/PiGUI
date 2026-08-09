import { render, screen, within } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { TraceIndexPage, TraceWorkspace } from "@/pages/trace";

vi.mock("./session-list", () => ({
  SessionListPanel: ({ selectedSessionId }: { selectedSessionId?: string }) => (
    <div data-selected-session-id={selectedSessionId ?? ""} data-testid="mock-session-list" />
  ),
}));

function renderTraceWorkspace() {
  const rootRoute = createRootRoute({
    component: () => (
      <TraceWorkspace selectedSessionId="session-a">
        <div data-testid="mock-trace-detail">Trace detail</div>
      </TraceWorkspace>
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
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute.addChildren([indexRoute, sessionRoute, usageRoute, setupRoute]),
  });

  return render(<RouterProvider router={router} />);
}

function renderTraceIndexPage() {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: TraceIndexPage,
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

describe("TraceWorkspace", () => {
  it("lays the trace out as a fixed-width sidebar finder and a fluid reading pane", async () => {
    const { container } = renderTraceWorkspace();

    expect(await screen.findByTestId("mock-trace-detail")).toBeInTheDocument();
    expect(screen.getByTestId("mock-session-list")).toHaveAttribute(
      "data-selected-session-id",
      "session-a",
    );
    const traceWorkspace = screen.getByTestId("trace-workspace");

    expect(traceWorkspace).toHaveClass("h-full", "min-h-0", "overflow-hidden");

    const frame = screen.getByTestId("trace-split-view");
    expect(frame).toHaveClass("h-full", "min-h-0", "flex");
    // No resizer, no percentage split: the finder has a fixed budget.
    expect(frame.querySelector('[data-slot="resizable-handle"]')).not.toBeInTheDocument();

    const listPane = screen.getByTestId("trace-list-pane");
    expect(listPane).toHaveClass("w-80", "shrink-0", "border-r");
    const detailPane = screen.getByTestId("trace-detail-pane");
    expect(detailPane).toHaveClass("flex-1", "min-w-0", "min-h-0", "overflow-hidden");
    expect(container.querySelector('[role="main"]')).toBeInTheDocument();
  });

  it("frames trace replay as a first-level Trace surface", async () => {
    renderTraceIndexPage();

    const detailPane = await screen.findByTestId("trace-detail-pane");

    expect(
      await within(detailPane).findByText("Trace"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Analyze / Trace")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Select a Pi session trace" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-session-list")).toBeInTheDocument();
  });
});
