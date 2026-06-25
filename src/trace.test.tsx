import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";
import { TraceWorkspace, getTraceResizableSizes } from "./trace";

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

describe("TraceWorkspace", () => {
  it("uses percentage panel sizes for the desktop resizable split", () => {
    expect(getTraceResizableSizes(true)).toEqual({
      detailDefaultSize: 54,
      detailMinSize: 40,
      listDefaultSize: 46,
      listMaxSize: 55,
      listMinSize: 38,
    });
  });

  it("keeps the trace page fixed with independent list and detail panes", async () => {
    const { container } = renderTraceWorkspace();

    expect(await screen.findByTestId("mock-trace-detail")).toBeInTheDocument();
    expect(screen.getByTestId("mock-session-list")).toHaveAttribute(
      "data-selected-session-id",
      "session-a",
    );
    expect(screen.getByTestId("trace-workspace")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden",
    );
    const splitView = container.querySelector('[data-slot="resizable"]');
    expect(splitView).toHaveClass("h-full", "min-h-0");
    expect(splitView).not.toHaveClass("grid");
    expect(container.querySelectorAll('[data-slot="resizable-panel"]')).toHaveLength(2);
    expect(container.querySelector('[data-slot="resizable-handle"]')).toBeInTheDocument();
    expect(screen.getByTestId("trace-list-pane")).toHaveClass("min-h-0");
    expect(screen.getByTestId("trace-detail-pane")).toHaveClass(
      "min-h-0",
      "overflow-hidden",
    );
    expect(container.querySelector(".app-layout__main")).toBeInTheDocument();
  });
});
