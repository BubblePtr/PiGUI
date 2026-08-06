import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { AgentWorkspaceSessionsPage } from "@/pages/agent-workspace";
import { PreflightPage, preflightStatusQueryKey } from "@/pages/preflight";
import { SettingsPage } from "@/pages/settings";
import { SetupPage } from "@/pages/setup";
import { TraceIndexPage, TraceSessionPage } from "@/pages/trace";
import { UsagePage } from "@/pages/usage";
import type { EnvironmentPreflightStatus } from "@pigui/core";
import { SessionProjectionsProvider } from "@/entities/session/use-session-projections";
import { invoke, isElectronRuntime } from "@/shared/runtime";
import "./styles.css";

const queryClient = new QueryClient();

function PreflightGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onPreflightRoute = pathname === "/preflight";
  const statusQuery = useQuery({
    queryKey: preflightStatusQueryKey,
    queryFn: () => invoke<EnvironmentPreflightStatus>("get_environment_preflight_status"),
  });

  useEffect(() => {
    if (statusQuery.isLoading || statusQuery.isFetching) {
      return;
    }

    if (statusQuery.isError || !statusQuery.data) {
      return;
    }

    if (!statusQuery.data.completedAt && !onPreflightRoute) {
      void navigate({ to: "/preflight", replace: true });
    }
  }, [
    navigate,
    onPreflightRoute,
    statusQuery.data,
    statusQuery.isError,
    statusQuery.isFetching,
    statusQuery.isLoading,
  ]);

  if (statusQuery.isLoading || (statusQuery.isFetching && !statusQuery.data)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted">
        Checking environment readiness…
      </main>
    );
  }

  if (statusQuery.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-danger">
        Could not load environment preflight status:{" "}
        {statusQuery.error instanceof Error
          ? statusQuery.error.message
          : String(statusQuery.error)}
      </main>
    );
  }

  if (!statusQuery.data?.completedAt && !onPreflightRoute) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted">
        Opening environment check…
      </main>
    );
  }

  return children;
}

const rootRoute = createRootRoute({
  component: () => (
    <PreflightGate>
      <Outlet />
    </PreflightGate>
  ),
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

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const preflightRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/preflight",
  component: PreflightPage,
});

const router = createRouter({
  ...(isElectronRuntime() ? { history: createHashHistory() } : {}),
  routeTree: rootRoute.addChildren([
    indexRoute,
    sessionDetailRoute,
    usageRoute,
    projectSessionsRoute,
    setupRoute,
    settingsRoute,
    preflightRoute,
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
      <SessionProjectionsProvider>
        <RouterProvider router={router} />
      </SessionProjectionsProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
