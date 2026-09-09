import { describe, expect, it } from "vitest";
import { CHAT_PROJECT_ID } from "@pace/core";
import {
  CHAT_PICKER_LABEL,
  CHAT_WORKSPACE_DISPLAY_NAME,
  chatWorkspaceDescriptor,
  chatWorkspaceListEntry,
  isChatProjectId,
} from "@/entities/project/chat-workspace";
import { addProjectToRegistry, getProjectRegistry } from "@/entities/project/project-registry";

describe("Chat Workspace descriptor", () => {
  it("uses the shared chat sentinel and is not a registry Project", () => {
    expect(chatWorkspaceDescriptor()).toEqual({
      id: CHAT_PROJECT_ID,
      displayName: CHAT_WORKSPACE_DISPLAY_NAME,
    });
    expect(CHAT_PROJECT_ID).toBe("chat");
    expect(isChatProjectId("chat")).toBe(true);
    expect(isChatProjectId("/Users/void/code/opensource/Pig")).toBe(false);
    expect(isChatProjectId(null)).toBe(false);
    expect(CHAT_PICKER_LABEL).toBe("No project");

    addProjectToRegistry("/Users/void/code/opensource/Pig", {
      now: () => "2026-09-07T00:00:00.000Z",
    });

    expect(getProjectRegistry().some((project) => project.id === CHAT_PROJECT_ID)).toBe(
      false,
    );
    expect(chatWorkspaceListEntry().id).toBe("chat");
  });
});
