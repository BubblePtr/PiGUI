import React from "react";
import ReactDOM from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentWorkspaceSessionsPage } from "@/pages/agent-workspace";
import { SetupPage } from "@/pages/setup";
import { TraceIndexPage, TraceSessionPage } from "@/pages/trace";
import { UsagePage } from "@/pages/usage";
import "./styles.css";

const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TraceIndexPage,
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions/$sessionId",
  component: TraceSessionPage,
});

const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage",
  component: UsagePage,
});

const projectSessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/sessions",
  component: AgentWorkspaceSessionsPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupPage,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    sessionDetailRoute,
    usageRoute,
    projectSessionsRoute,
    setupRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
