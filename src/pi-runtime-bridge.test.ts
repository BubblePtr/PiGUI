import { describe, expect, it } from "vitest";
import { PiRuntimeBridgeError, createFakePiRuntimeBridge } from "./pi-runtime-bridge";

describe("Pi Runtime Bridge contract", () => {
  it("creates Pi Session State and emits the first runtime event after accepting the initial prompt", async () => {
    const bridge = createFakePiRuntimeBridge({
      now: () => "2026-06-26T08:00:00.000Z",
    });
    const runtime = await bridge.startRuntime({
      sessionId: "session-1",
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

    const accepted = await bridge.sendInitialPrompt({
      piSessionId: state.piSessionId,
      prompt: "Create a resumable live session",
    });

    await expect(bridge.getSessionState(state.piSessionId)).resolves.toMatchObject({
      piSessionId: state.piSessionId,
      status: "running",
      events: [
        expect.objectContaining({
          id: accepted.event.id,
          kind: "message",
          role: "user",
          body: "Create a resumable live session",
          timestamp: "2026-06-26T08:00:00.000Z",
        }),
      ],
    });
    expect(runtime).toMatchObject({
      projectId: "pig",
      status: "ready",
    });
    expect(state).toMatchObject({
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
      status: "idle",
    });
    expect(accepted).toMatchObject({
      accepted: true,
      piSessionId: state.piSessionId,
    });
  });

  it("reports fake bridge failures with the runtime stage and error detail", async () => {
    const bridge = createFakePiRuntimeBridge({
      failAt: "send-initial-prompt",
      failureMessage: "Pi rejected the initial prompt",
    });
    const runtime = await bridge.startRuntime({
      sessionId: "session-1",
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
      bridge.sendInitialPrompt({
        piSessionId: state.piSessionId,
        prompt: "Create a resumable live session",
      }),
    ).rejects.toMatchObject({
      name: "PiRuntimeBridgeError",
      stage: "sending prompt",
      message: "Pi rejected the initial prompt",
    });
    await expect(
      bridge.sendInitialPrompt({
        piSessionId: state.piSessionId,
        prompt: "Create a resumable live session",
      }),
    ).rejects.toBeInstanceOf(PiRuntimeBridgeError);
  });

  it("restores fake Pi Session State so projections can resync from runtime truth", async () => {
    const bridge = createFakePiRuntimeBridge();

    await bridge.restoreSessionState({
      piSessionId: "pi-session-restored",
      runtimeId: "runtime-restored",
      projectId: "pig",
      cwd: "/Users/void/code/opensource/Pig",
      status: "completed",
      updatedAt: "2026-06-26T08:00:12.000Z",
      events: [
        {
          id: "runtime-event-1",
          piSessionId: "pi-session-restored",
          kind: "message",
          role: "assistant",
          body: "Recovered runtime state.",
          timestamp: "2026-06-26T08:00:12.000Z",
        },
      ],
    });

    await expect(bridge.getSessionState("pi-session-restored")).resolves.toMatchObject({
      piSessionId: "pi-session-restored",
      status: "completed",
      events: [
        expect.objectContaining({
          body: "Recovered runtime state.",
        }),
      ],
    });
  });
});
