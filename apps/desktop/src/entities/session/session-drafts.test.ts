import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSessionDraft,
  ensureSessionDraft,
  getSessionDraft,
  hasSessionDraft,
  saveSessionDraft,
  setSessionDraftTarget,
} from "@/entities/session/session-drafts";

describe("Session Draft storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps one global draft and retargets it without clearing prompt text", () => {
    const createdDraft = ensureSessionDraft("/Users/void/code/opensource/Pig");
    const savedDraft = saveSessionDraft(
      "/Users/void/code/opensource/Pig",
      "Run the control-plane tests",
    );
    const retargetedDraft = ensureSessionDraft("/Users/void/Documents/study");

    expect(createdDraft).toMatchObject({
      projectId: "/Users/void/code/opensource/Pig",
      prompt: "",
    });
    expect(savedDraft).toMatchObject({
      projectId: "/Users/void/code/opensource/Pig",
      prompt: "Run the control-plane tests",
    });
    expect(retargetedDraft).toMatchObject({
      projectId: "/Users/void/Documents/study",
      prompt: "Run the control-plane tests",
    });
    expect(getSessionDraft()).toEqual(retargetedDraft);
    expect(window.localStorage.getItem("pig.sessionDraft.v2")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("pigui.sessionDraft.v2") ?? "{}"))
      .toMatchObject({
        projectId: "/Users/void/Documents/study",
        prompt: "Run the control-plane tests",
      });
  });

  it("does not read obsolete pig namespace draft data", () => {
    window.localStorage.setItem(
      "pig.sessionDraft.v2",
      JSON.stringify({
        projectId: "/Users/void/code/opensource/Pig",
        prompt: "Old current draft",
        updatedAt: "2026-06-30T08:00:00.000Z",
      }),
    );
    window.localStorage.setItem(
      "pig.sessionDrafts.v1",
      JSON.stringify({
        "/Users/void/Documents/study": {
          projectId: "/Users/void/Documents/study",
          prompt: "Old legacy draft",
          updatedAt: "2026-06-30T08:01:00.000Z",
        },
      }),
    );

    expect(getSessionDraft()).toBeNull();
  });

  it("clears a missing target Project while preserving the draft text", () => {
    saveSessionDraft("/Users/void/code/opensource/Pig", "Keep this global draft");

    expect(
      getSessionDraft({
        projectIds: ["/Users/void/Documents/study"],
      }),
    ).toMatchObject({
      projectId: null,
      prompt: "Keep this global draft",
    });
    expect(getSessionDraft()?.projectId).toBeNull();
  });

  it("exposes a Project indicator only for the current target Project", () => {
    saveSessionDraft("/Users/void/code/opensource/Pig", "Draft for Pig");

    expect(hasSessionDraft("/Users/void/code/opensource/Pig")).toBe(true);
    expect(hasSessionDraft("/Users/void/Documents/study")).toBe(false);

    setSessionDraftTarget("/Users/void/Documents/study");

    expect(hasSessionDraft("/Users/void/code/opensource/Pig")).toBe(false);
    expect(hasSessionDraft("/Users/void/Documents/study")).toBe(true);
    expect(getSessionDraft()?.prompt).toBe("Draft for Pig");

    clearSessionDraft();

    expect(getSessionDraft()).toBeNull();
  });
});
