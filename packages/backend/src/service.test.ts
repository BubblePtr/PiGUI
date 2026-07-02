import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBackendService } from "./service";
import { createFakePiRpcTransport } from "@pigui/core/testing";

const createAgentSession = vi.hoisted(() => vi.fn());

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession,
}));

function fixtureAgentDir() {
  return join(process.cwd(), "fixtures/pi-agent");
}

function createFakeSdkAgentSession() {
  const listeners: Array<(event: unknown) => void> = [];
  let resolvePrompt: (() => void) | undefined;
  const session = {
    sessionId: "pi-session-sdk",
    isStreaming: false,
    messages: [],
    model: {
      provider: { id: "openai" },
      id: "gpt-5-codex",
    },
    prompt: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        }),
    ),
    abort: vi.fn(async () => {}),
    dispose: vi.fn(),
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      listeners.push(listener);

      return vi.fn();
    }),
    getSessionStats: vi.fn(() => ({
      tokens: { total: 42 },
      cost: 0.001,
    })),
  };

  return {
    session,
    emit(event: unknown) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    resolvePrompt() {
      resolvePrompt?.();
    },
  };
}

describe("backend service", () => {
  beforeEach(() => {
    createAgentSession.mockReset();
  });

  it("handles query commands through request/response envelopes", async () => {
    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      gitClient: {
        isGitRepository: async () => true,
        addDetachedWorktree: async () => {},
      },
      piRpc: createFakePiRpcTransport(),
    });

    await expect(service.handleRequest({ id: "req-1", method: "list_sessions" })).resolves.toEqual({
      id: "req-1",
      result: expect.arrayContaining([
        expect.objectContaining({
          id: "newest-session",
          project: "gamma",
        }),
      ]),
    });
    await expect(
      service.handleRequest({
        id: "req-2",
        method: "get_session_detail",
        params: { id: "middle-session" },
      }),
    ).resolves.toEqual({
      id: "req-2",
      result: expect.objectContaining({
        id: "middle-session",
        turns: expect.any(Array),
      }),
    });
    await expect(service.handleRequest({ id: "req-3", method: "get_config_inventory" })).resolves.toEqual({
      id: "req-3",
      result: expect.objectContaining({
        defaultModel: "gpt-5-codex",
      }),
    });
  });

  it("uses the SDK driver for Runtime Gateway by default while retaining raw RPC commands", async () => {
    const sdkSession = createFakeSdkAgentSession();
    const piRpc = createFakePiRpcTransport();
    createAgentSession.mockResolvedValue({ session: sdkSession.session });
    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      piRpc,
    });
    const events: unknown[] = [];

    service.onEvent((event) => {
      events.push(event);
    });

    await expect(
      service.handleRequest({
        id: "req-create",
        method: "create_session",
        params: {
          sessionId: "session-1",
          projectId: "project-1",
          cwd: process.cwd(),
        },
      }),
    ).resolves.toEqual({
      id: "req-create",
      result: expect.objectContaining({
        sessionId: "session-1",
        runtimeId: "pi-sdk:session-1",
        piSessionId: "pi-session-sdk",
      }),
    });
    expect(createAgentSession).toHaveBeenCalledWith({
      cwd: process.cwd(),
    });
    expect(piRpc.startCalls).toEqual([]);
    expect(piRpc.commands).toEqual([]);

    await expect(
      service.handleRequest({
        id: "req-send",
        method: "send_prompt",
        params: {
          piSessionId: "pi-session-sdk",
          prompt: "Hello Pi",
        },
      }),
    ).resolves.toEqual({
      id: "req-send",
      result: expect.objectContaining({
        seq: 1,
        sessionId: "session-1",
        piSessionId: "pi-session-sdk",
        type: "message_update",
        payload: expect.objectContaining({
          role: "user",
          body: "Hello Pi",
        }),
      }),
    });
    expect(sdkSession.session.prompt).toHaveBeenCalledWith("Hello Pi");

    sdkSession.emit({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hi from SDK" }],
      },
    });
    sdkSession.resolvePrompt();

    expect(events).toEqual([
      {
        type: "event",
        event: expect.objectContaining({
          seq: 1,
          sessionId: "session-1",
          piSessionId: "pi-session-sdk",
          type: "message_update",
          payload: expect.objectContaining({
            role: "user",
            body: "Hello Pi",
          }),
        }),
      },
      {
        type: "event",
        event: expect.objectContaining({
          seq: 2,
          sessionId: "session-1",
          piSessionId: "pi-session-sdk",
          type: "message_update",
          payload: expect.objectContaining({
            role: "assistant",
            body: "Hi from SDK",
          }),
        }),
      },
    ]);
    await expect(
      service.handleRequest({
        id: "req-rpc",
        method: "send_pi_rpc_command",
        params: {
          command: {
            id: "legacy-rpc-1",
            type: "get_state",
          },
        },
      }),
    ).resolves.toEqual({
      id: "req-rpc",
      result: expect.objectContaining({
        command: "get_state",
        success: true,
      }),
    });
    expect(piRpc.commands).toEqual([
      {
        id: "legacy-rpc-1",
        type: "get_state",
      },
    ]);
  });
});
