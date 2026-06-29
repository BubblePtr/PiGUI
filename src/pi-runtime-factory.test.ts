import { describe, expect, it } from "vitest";
import { createDefaultPiRuntimeBridge } from "./pi-runtime-factory";

describe("default Pi runtime bridge factory", () => {
  it("uses an in-browser fake bridge outside Electron so dev-server sessions stay interactive", async () => {
    const bridge = createDefaultPiRuntimeBridge({
      now: () => "2026-06-26T08:00:00.000Z",
    });
    const runtime = await bridge.startRuntime({
      sessionId: "session-browser",
      projectId: "pig",
      checkout: {
        mode: "foreground-local",
        root: "/Users/void/code/opensource/Pig",
        runtimeCwd: "/Users/void/code/opensource/Pig",
      },
    });
    const state = await bridge.createPiSessionState({
      runtimeId: runtime.runtimeId,
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
    });

    await expect(
      bridge.queueFollowUp({
        piSessionId: state.piSessionId,
        message: "Queue a browser fallback follow-up.",
      }),
    ).resolves.toMatchObject({
      status: "pending",
      body: "Queue a browser fallback follow-up.",
    });
  });
});
