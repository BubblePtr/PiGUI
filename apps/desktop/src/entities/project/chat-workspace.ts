import { CHAT_PROJECT_ID } from "@pigui/core";
import type { ProjectRegistryEntry } from "@/entities/project/project-registry";

export { CHAT_PROJECT_ID };

export const CHAT_WORKSPACE_DISPLAY_NAME = "Chat";
export const CHAT_PICKER_LABEL = "Chat · no project";

export type ChatWorkspaceDescriptor = {
  id: typeof CHAT_PROJECT_ID;
  displayName: typeof CHAT_WORKSPACE_DISPLAY_NAME;
};

export function isChatProjectId(projectId: string | null | undefined): boolean {
  return projectId === CHAT_PROJECT_ID;
}

export function chatWorkspaceDescriptor(): ChatWorkspaceDescriptor {
  return {
    id: CHAT_PROJECT_ID,
    displayName: CHAT_WORKSPACE_DISPLAY_NAME,
  };
}

/**
 * Sidebar/picker shape for the built-in Chat Workspace. Never written to
 * pigui.projectRegistry.v1 and never passed through normalizeProjectPath.
 */
export function chatWorkspaceListEntry(): ProjectRegistryEntry {
  return {
    id: CHAT_PROJECT_ID,
    path: CHAT_PROJECT_ID,
    displayName: CHAT_WORKSPACE_DISPLAY_NAME,
    addedAt: "1970-01-01T00:00:00.000Z",
  };
}
