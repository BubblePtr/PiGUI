import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackendService } from "./service";
import { createInMemorySessionEventJournal } from "./session-event-journal";
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

const tempDirs: string[] = [];

async function tempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "pigui-service-"));

  tempDirs.push(dir);

  return dir;
}

describe("backend service", () => {
  beforeEach(() => {
    createAgentSession.mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
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

  it("journals boundary events to the data dir and serves them from the runtime snapshot", async () => {
    const sdkSession = createFakeSdkAgentSession();
    createAgentSession.mockResolvedValue({ session: sdkSession.session });
    const dataDir = await tempDataDir();
    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      dataDir,
      piRpc: createFakePiRpcTransport(),
    });

    await service.handleRequest({
      id: "req-create",
      method: "create_session",
      params: { sessionId: "session-1", projectId: "project-1", cwd: process.cwd() },
    });
    await service.handleRequest({
      id: "req-send",
      method: "send_prompt",
      params: { piSessionId: "pi-session-sdk", prompt: "Hello Pi" },
    });

    const streamingMessage = { role: "assistant", content: [] };

    sdkSession.emit({ type: "agent_start" });
    sdkSession.emit({ type: "turn_start" });
    sdkSession.emit({ type: "message_start", message: streamingMessage });
    sdkSession.emit({
      type: "message_update",
      message: streamingMessage,
      assistantMessageEvent: { type: "text_start", contentIndex: 0, partial: streamingMessage },
    });
    sdkSession.emit({
      type: "message_update",
      message: streamingMessage,
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "Hi from",
        partial: streamingMessage,
      },
    });
    sdkSession.emit({
      type: "message_update",
      message: streamingMessage,
      assistantMessageEvent: {
        type: "text_end",
        contentIndex: 0,
        content: "Hi from SDK",
        partial: streamingMessage,
      },
    });
    sdkSession.emit({ type: "message_end", message: streamingMessage });
    sdkSession.emit({ type: "turn_end" });
    sdkSession.emit({ type: "agent_end" });
    sdkSession.resolvePrompt();

    const response = await service.handleRequest({
      id: "req-snapshot",
      method: "get_runtime_snapshot",
      params: { piSessionId: "pi-session-sdk" },
    });
    const snapshot = response.result as {
      events: Array<{ seq: number; payload: Record<string, unknown> }>;
    };

    expect(snapshot.events[0]?.payload).toEqual(
      expect.objectContaining({ role: "user", body: "Hello Pi" }),
    );
    expect(snapshot.events).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          type: "message_part",
          phase: "end",
          body: "Hi from SDK",
        }),
      }),
    );
    expect(snapshot.events).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          type: "run",
          phase: "end",
          outcome: "completed",
        }),
      }),
    );
    expect(
      snapshot.events.some(
        (event) =>
          event.payload.type === "message_part" && event.payload.phase === "update",
      ),
    ).toBe(false);

    const journalLines = (
      await readFile(join(dataDir, "sessions", "pi-session-sdk.jsonl"), "utf8")
    )
      .trim()
      .split("\n");

    expect(journalLines).toHaveLength(snapshot.events.length);
  });

  it("uses the SDK driver for Runtime Gateway by default while retaining raw RPC commands", async () => {
    const sdkSession = createFakeSdkAgentSession();
    const piRpc = createFakePiRpcTransport();
    createAgentSession.mockResolvedValue({ session: sdkSession.session });
    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      // In-memory journal: this test never reads the snapshot back, so a file
      // journal's in-flight append would race the temp-dir cleanup.
      runtimeJournal: createInMemorySessionEventJournal(),
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

    const streamingMessage = { role: "assistant", content: [] };

    sdkSession.emit({ type: "agent_start" });
    sdkSession.emit({ type: "turn_start" });
    sdkSession.emit({ type: "message_start", message: streamingMessage });
    sdkSession.emit({
      type: "message_update",
      message: streamingMessage,
      assistantMessageEvent: { type: "text_start", contentIndex: 0, partial: streamingMessage },
    });
    sdkSession.emit({
      type: "message_update",
      message: streamingMessage,
      assistantMessageEvent: {
        type: "text_end",
        contentIndex: 0,
        content: "Hi from SDK",
        partial: streamingMessage,
      },
    });
    sdkSession.resolvePrompt();

    // The user echo stays a Gateway-minted legacy envelope; SDK stream events
    // arrive as Agent Runtime Event Model payloads (ADR-0020).
    expect(events[0]).toEqual({
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
    });
    expect(events).toContainEqual({
      type: "event",
      event: expect.objectContaining({
        sessionId: "session-1",
        piSessionId: "pi-session-sdk",
        type: "message_part",
        payload: expect.objectContaining({
          type: "message_part",
          partType: "text",
          body: "Hi from SDK",
          surface: "chat",
          origin: "sdk",
        }),
      }),
    });
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
