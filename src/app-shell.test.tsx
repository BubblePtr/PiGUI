import { render, screen } from "@testing-library/react";
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
    expect(container.querySelector("[data-app-layout]")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="sidebar"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="navbar"]')).toBeInTheDocument();
    expect(container.querySelector('[data-current="true"]')).toHaveTextContent("用量");
  });

  it("does not import standalone React Aria Heading into the app shell", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app-shell.tsx"),
      "utf8",
    );

    expect(source).not.toContain('react-aria-components/Heading');
  });
});
