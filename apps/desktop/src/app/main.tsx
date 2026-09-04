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
import { AppLandingPage } from "@/pages/app-landing";
import { AgentWorkspaceSessionsPage } from "@/pages/agent-workspace";
import { PreflightPage, preflightStatusQueryKey } from "@/pages/preflight";
import { SettingsPage } from "@/pages/settings";
import { SetupPage } from "@/pages/setup";
import { TraceIndexPage, TraceSessionPage } from "@/pages/trace";
import { UsagePage } from "@/pages/usage";
import type { EnvironmentPreflightStatus } from "@pigui/core";
import { SessionProjectionsProvider } from "@/entities/session/use-session-projections";
import { invoke, isElectronRuntime } from "@/shared/runtime";
import { Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
// Astryx CSS is @imported inside styles.css (after tailwindcss) so its
// cascade layers outrank Tailwind preflight.
import "./styles.css";

const queryClient = new QueryClient();

function isPreflightExemptPath(pathname: string) {
  // Preflight itself, plus Provider Settings so "Configure providers →" can
  // leave the gate without bouncing straight back (S3 E2E / DF-002).
  return (
    pathname === "/preflight" ||
    pathname === "/design" ||
    // PROTO cot-live — remove with the prototype
    pathname === "/proto/cot-live" ||
    // /PROTO cot-live
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

function PreflightGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onExemptRoute = isPreflightExemptPath(pathname);
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

    if (!statusQuery.data.completedAt && !onExemptRoute) {
      void navigate({ to: "/preflight", replace: true });
    }
  }, [
    navigate,
    onExemptRoute,
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

  if (!statusQuery.data?.completedAt && !onExemptRoute) {
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
  component: AppLandingPage,
});

const traceIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trace",
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

// Dev-only design gallery. Both the createRoute() call and the page import
// must live inside the DEV branch: a top-level createRoute() is not provably
// pure, and a static import would keep the page in the production bundle
// even with the route unregistered.
const devOnlyRoutes = import.meta.env.DEV
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/design",
        component: React.lazy(async () => ({
          default: (await import("@/pages/design")).DesignPage,
        })),
      }),
      // PROTO cot-live — throwaway ADR-0030 CoT prototype, remove with it
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/proto/cot-live",
        component: React.lazy(async () => ({
          default: (await import("@/proto/cot-live/harness")).CotLiveProtoPage,
        })),
      }),
      // /PROTO cot-live
    ]
  : [];

// Dev-only UI intent picker (floating crosshair button / Cmd+Ctrl+Shift+X).
// Same DEV-gated lazy pattern as the design route: the module never lands in
// production bundles.
const DevUiIntentPicker = import.meta.env.DEV
  ? React.lazy(async () => ({
      default: (await import("@/dev/ui-intent/ui-intent-picker")).UiIntentPicker,
    }))
  : null;

const router = createRouter({
  ...(isElectronRuntime() ? { history: createHashHistory() } : {}),
  routeTree: rootRoute.addChildren([
    indexRoute,
    traceIndexRoute,
    sessionDetailRoute,
    usageRoute,
    projectSessionsRoute,
    setupRoute,
    settingsRoute,
    preflightRoute,
    ...devOnlyRoutes,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Theme theme={neutralTheme}>
      <QueryClientProvider client={queryClient}>
        <SessionProjectionsProvider>
          <RouterProvider router={router} />
          {DevUiIntentPicker ? (
            <React.Suspense fallback={null}>
              <DevUiIntentPicker />
            </React.Suspense>
          ) : null}
        </SessionProjectionsProvider>
      </QueryClientProvider>
    </Theme>
  </React.StrictMode>,
);
