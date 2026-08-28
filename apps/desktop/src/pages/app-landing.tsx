import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { resolveAppLanding } from "@/app/app-landing";
import { getProjectRegistry } from "@/entities/project/project-registry";
import { ensureSessionDraft, getSessionDraft } from "@/entities/session/session-drafts";
import { getProjectRegistryWithBrowserDevelopmentFallback } from "@/shared/browser-development-data";

export function AppLandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const landing = resolveAppLanding({
      projects: getProjectRegistryWithBrowserDevelopmentFallback(getProjectRegistry()),
      draft: getSessionDraft(),
    });

    if (landing.to === "/trace") {
      void navigate({ to: "/trace", replace: true });
      return;
    }

    ensureSessionDraft(landing.draftProjectId);
    void navigate({
      to: `/projects/${encodeURIComponent(landing.params.projectId)}/sessions` as never,
      search: landing.search as never,
      replace: true,
    });
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted">
      Opening New Session…
    </main>
  );
}
