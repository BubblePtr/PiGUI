import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureSessionDraft,
  getSessionDraft,
  hasSessionDraft,
  saveSessionDraft,
} from "@/entities/session/session-drafts";

describe("Session Draft storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps at most one persisted draft per Project", () => {
    const createdDraft = ensureSessionDraft("pig");
    const savedDraft = saveSessionDraft("pig", "Run the control-plane tests");
    const resumedDraft = ensureSessionDraft("pig");

    expect(createdDraft).toMatchObject({ projectId: "pig", prompt: "" });
    expect(savedDraft).toMatchObject({
      projectId: "pig",
      prompt: "Run the control-plane tests",
    });
    expect(resumedDraft).toEqual(savedDraft);
    expect(getSessionDraft("pig")).toEqual(savedDraft);
  });

  it("persists drafts independently for different Projects", () => {
    saveSessionDraft("pig", "Draft for Pig");
    saveSessionDraft("pig-docs", "Draft for docs");

    expect(hasSessionDraft("pig")).toBe(true);
    expect(hasSessionDraft("pig-docs")).toBe(true);
    expect(getSessionDraft("pig")?.prompt).toBe("Draft for Pig");
    expect(getSessionDraft("pig-docs")?.prompt).toBe("Draft for docs");
  });
});
