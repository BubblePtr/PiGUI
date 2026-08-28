import { beforeEach, describe, expect, it } from "vitest";
import { resolveAppLanding } from "@/app/app-landing";

const pigProjectId = "/Users/void/code/opensource/Pig";
const studyProjectId = "/Users/void/Documents/study";

describe("resolveAppLanding", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("opens Trace when the Project Registry is empty", () => {
    expect(
      resolveAppLanding({
        projects: [],
        draft: null,
      }),
    ).toEqual({ to: "/trace" });
  });

  it("opens the New Session draft on the first registered Project when none is targeted", () => {
    expect(
      resolveAppLanding({
        projects: [{ id: pigProjectId }, { id: studyProjectId }],
        draft: null,
      }),
    ).toEqual({
      to: "/projects/$projectId/sessions",
      params: { projectId: pigProjectId },
      search: { view: "draft" },
      draftProjectId: null,
    });
  });

  it("keeps an existing draft target when that Project is still registered", () => {
    expect(
      resolveAppLanding({
        projects: [{ id: pigProjectId }, { id: studyProjectId }],
        draft: { projectId: studyProjectId },
      }),
    ).toEqual({
      to: "/projects/$projectId/sessions",
      params: { projectId: studyProjectId },
      search: { view: "draft" },
      draftProjectId: studyProjectId,
    });
  });

  it("routes through the first Project and drops a missing draft target", () => {
    expect(
      resolveAppLanding({
        projects: [{ id: pigProjectId }],
        draft: { projectId: studyProjectId },
      }),
    ).toEqual({
      to: "/projects/$projectId/sessions",
      params: { projectId: pigProjectId },
      search: { view: "draft" },
      draftProjectId: null,
    });
  });
});
