import { afterEach, describe, expect, it, vi } from "vitest";
import { listSessionProjections } from "@/entities/session/sessions";
import type { PiGUIRendererApi } from "@/shared/runtime";

describe("session queries", () => {
  afterEach(() => {
    delete window.pigui;
  });

  it("lists PiGUI Session Projections through the persisted projection endpoint", async () => {
    const invoke = vi.fn(async () => [
      {
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        projectId: "pig",
        cwd: "/repo",
        status: "idle",
        updatedAt: "2026-07-03T10:00:00.000Z",
      },
    ]);
    window.pigui = {
      invoke: invoke as unknown as PiGUIRendererApi["invoke"],
      onBackendEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    await expect(listSessionProjections()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "session-1",
        piSessionId: "pi-session-1",
      }),
    ]);
    expect(invoke).toHaveBeenCalledWith("list_session_projections", undefined);
  });
});
