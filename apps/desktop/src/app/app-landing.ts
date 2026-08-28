import type { ProjectRegistryEntry } from "@/entities/project/project-registry";

export type AppLanding =
  | { to: "/trace" }
  | {
      to: "/projects/$projectId/sessions";
      params: { projectId: string };
      search: { view: "draft" };
      draftProjectId: string | null;
    };

export function resolveAppLanding(input: {
  projects: Array<Pick<ProjectRegistryEntry, "id">>;
  draft: { projectId: string | null } | null;
}): AppLanding {
  const firstProjectId = input.projects[0]?.id;

  if (!firstProjectId) {
    return { to: "/trace" };
  }

  const requestedDraftProjectId = input.draft?.projectId ?? null;
  const draftProjectId =
    requestedDraftProjectId &&
    input.projects.some((project) => project.id === requestedDraftProjectId)
      ? requestedDraftProjectId
      : null;
  const routeProjectId = draftProjectId ?? firstProjectId;

  return {
    to: "/projects/$projectId/sessions",
    params: { projectId: routeProjectId },
    search: { view: "draft" },
    draftProjectId,
  };
}
