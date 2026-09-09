import { describe, expect, it } from "vitest";
import type { PersistedSessionProjection } from "@pace/backend";
import type {
  RuntimeGatewaySnapshot,
  SessionChanges,
  SessionDirectoryListing,
  SessionFileContent,
} from "@pace/core";
import { createMockApi } from "./scenarios";

describe("static development sessions", () => {
  it("opens listed sessions and reads changed files through the same checkout paths", async () => {
    const api = createMockApi();
    const sessions = await api.invoke<PersistedSessionProjection[]>(
      "list_session_projections",
    );
    const session = sessions.find((item) => item.sessionId === "mock-review")!;
    const snapshot = await api.invoke<RuntimeGatewaySnapshot>(
      "resume_session",
      { sessionId: session.sessionId },
    );
    expect(snapshot.piSessionId).toBe(session.piSessionId);
    expect(snapshot.events.length).toBeGreaterThan(0);
    const changes = await api.invoke<SessionChanges>("get_session_changes", {
      sessionId: session.sessionId,
    });
    const changed = changes.files.find((file) => file.kind === "modified")!;
    const path = changed.path.slice(0, changed.path.lastIndexOf("/"));
    const directory = await api.invoke<SessionDirectoryListing>(
      "list_session_directory",
      { sessionId: session.sessionId, path },
    );
    expect(directory.entries.some((file) => file.path === changed.path)).toBe(
      true,
    );
    const file = await api.invoke<SessionFileContent>("read_session_file", {
      sessionId: session.sessionId,
      path: changed.path,
    });
    expect(file.content).toContain("export");
    expect(changed.patch).toContain(file.content.trim().split("\n")[0]);
  });
});
