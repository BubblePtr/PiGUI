import { describe, expect, it, vi } from "vitest";
import { runPiSdkDriverSpike } from "./pi-sdk-spike";
import type { PiSdkRuntimeFactory } from "./pi-sdk-driver";
import type { RuntimeGatewayDriverEvent } from "../gateway/runtime-gateway";

describe("Pi SDK spike runner", () => {
  it("refuses to run true SDK work without explicit opt-in", async () => {
    const runtimeFactory = vi.fn<PiSdkRuntimeFactory>();

    await expect(
      runPiSdkDriverSpike({
        env: {},
        cwd: "/Users/void/code/opensource/Pig",
        runtimeFactory,
      }),
    ).resolves.toMatchObject({
      ok: false,
      enabled: false,
      reason: "not-enabled",
    });
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it("runs the Gateway core loop through an injected runtime factory", async () => {
    const listeners: Array<(event: RuntimeGatewayDriverEvent) => void> = [];
    const dispose = vi.fn();
    let eventId = 0;
    const runtimeFactory: PiSdkRuntimeFactory = async () => ({
      piSessionId: "sdk-session-1",
      runtimeId: "pi-sdk:app-session-1",
      status: "idle",
      dispose,
      async sendPrompt() {
        listeners[0]?.({
          piSessionId: "sdk-session-1",
          type: "message_update",
          payload: {
            kind: "message",
            role: "assistant",
            body: "PIGUI_SDK_SPIKE_OK",
            bodyFormat: "full",
            messageId: "pi-sdk:sdk-session-1:assistant:0",
          },
        });
        listeners[0]?.({
          piSessionId: "sdk-session-1",
          type: "status",
          payload: {
            kind: "status",
            title: "Completed",
          },
        });
      },
      async getSnapshot() {
        return {
          status: "completed",
        };
      },
      onEvent(listener) {
        listeners.push(listener);

        return () => {};
      },
    });

    await expect(
      runPiSdkDriverSpike({
        env: { PIGUI_RUN_PI_SDK_SPIKE: "1" },
        cwd: "/Users/void/code/opensource/Pig",
        runtimeFactory,
        now: () => "2026-07-01T00:00:00.000Z",
        idFactory: () => `evt-${++eventId}`,
      }),
    ).resolves.toMatchObject({
      ok: true,
      enabled: true,
      capabilities: {
        create_session: { status: "confirmed" },
        send_prompt: { status: "confirmed" },
        receive_normalized_runtime_event: { status: "confirmed" },
        get_runtime_snapshot: { status: "confirmed" },
        session_identity: { status: "confirmed" },
      },
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("accepts expected assistant text split across normalized events", async () => {
    const listeners: Array<(event: RuntimeGatewayDriverEvent) => void> = [];
    const runtimeFactory: PiSdkRuntimeFactory = async () => ({
      piSessionId: "sdk-session-1",
      runtimeId: "pi-sdk:app-session-1",
      status: "idle",
      async sendPrompt() {
        for (const body of ["PIGUI_", "SDK_SPIKE_OK"]) {
          listeners[0]?.({
            piSessionId: "sdk-session-1",
            type: "message_update",
            payload: {
              kind: "message",
              role: "assistant",
              body,
              bodyFormat: "full",
              messageId: "pi-sdk:sdk-session-1:assistant:0",
            },
          });
        }
        listeners[0]?.({
          piSessionId: "sdk-session-1",
          type: "status",
          payload: {
            kind: "status",
            title: "Completed",
          },
        });
      },
      async getSnapshot() {
        return {
          status: "completed",
        };
      },
      onEvent(listener) {
        listeners.push(listener);

        return () => {};
      },
    });

    await expect(
      runPiSdkDriverSpike({
        env: { PIGUI_RUN_PI_SDK_SPIKE: "1" },
        cwd: "/Users/void/code/opensource/Pig",
        runtimeFactory,
      }),
    ).resolves.toMatchObject({
      ok: true,
      capabilities: {
        receive_normalized_runtime_event: { status: "confirmed" },
      },
    });
  });

  it("records SDK snapshot summary evidence for extended capability rows", async () => {
    const listeners: Array<(event: RuntimeGatewayDriverEvent) => void> = [];
    const runtimeFactory: PiSdkRuntimeFactory = async () => ({
      piSessionId: "sdk-session-1",
      runtimeId: "pi-sdk:app-session-1",
      status: "idle",
      async sendPrompt() {
        listeners[0]?.({
          piSessionId: "sdk-session-1",
          type: "message_update",
          payload: {
            kind: "message",
            role: "assistant",
            body: "PIGUI_SDK_SPIKE_OK",
            bodyFormat: "full",
            messageId: "pi-sdk:sdk-session-1:assistant:0",
          },
        });
        listeners[0]?.({
          piSessionId: "sdk-session-1",
          type: "status",
          payload: {
            kind: "status",
            title: "Completed",
          },
        });
      },
      async getSnapshot() {
        return {
          status: "completed",
          summary: {
            provider: "anthropic",
            model: "claude-opus-4-5",
            totalTokens: 37,
            totalCostUsd: 0.0123,
          },
        };
      },
      onEvent(listener) {
        listeners.push(listener);

        return () => {};
      },
    });

    await expect(
      runPiSdkDriverSpike({
        env: { PIGUI_RUN_PI_SDK_SPIKE: "1" },
        cwd: "/Users/void/code/opensource/Pig",
        runtimeFactory,
      }),
    ).resolves.toMatchObject({
      ok: true,
      capabilities: {
        usage_cost: {
          status: "confirmed",
          evidence: "totalTokens=37 totalCostUsd=0.0123",
        },
        model_thinking: {
          status: "partial",
          evidence: "provider=anthropic model=claude-opus-4-5",
        },
        resource_loading_cwd: {
          status: "partial",
          evidence: "/Users/void/code/opensource/Pig",
        },
      },
    });
  });

  it("does not confirm session identity when no runtime events are observed", async () => {
    const runtimeFactory: PiSdkRuntimeFactory = async () => ({
      piSessionId: "sdk-session-1",
      runtimeId: "pi-sdk:app-session-1",
      status: "idle",
      async sendPrompt() {},
      async getSnapshot() {
        return {
          status: "completed",
        };
      },
      onEvent() {
        return () => {};
      },
    });

    await expect(
      runPiSdkDriverSpike({
        env: { PIGUI_RUN_PI_SDK_SPIKE: "1" },
        cwd: "/Users/void/code/opensource/Pig",
        runtimeFactory,
        waitTimeoutMs: 1,
      }),
    ).resolves.toMatchObject({
      ok: false,
      capabilities: {
        receive_normalized_runtime_event: { status: "missing" },
        session_identity: { status: "missing" },
      },
    });
  });
});
