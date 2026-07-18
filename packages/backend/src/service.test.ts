import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackendService } from "./service";
import { createInMemorySessionEventJournal } from "./persistence/session-event-journal";
import { createInMemorySessionProjectionStore } from "./persistence/session-projection-store";
import { createFakePiRpcTransport } from "@pigui/core/testing";

const createAgentSession = vi.hoisted(() => vi.fn());
const sessionManagerOpen = vi.hoisted(() => vi.fn());
const sessionManagerListAll = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession,
  SessionManager: {
    open: sessionManagerOpen,
    listAll: sessionManagerListAll,
  },
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
    sessionManager: undefined as
      | {
          getCwd?(): string;
          getSessionFile?(): string;
        }
      | undefined,
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
    sessionManagerOpen.mockReset();
    sessionManagerListAll.mockReset();
    sessionManagerListAll.mockResolvedValue([]);
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

  it("resolves Session diff roots from the persisted projection", async () => {
    const projections = createInMemorySessionProjectionStore();
    const read = vi.fn(async (input) => ({
      sessionId: input.sessionId,
      state: "clean" as const,
      checkoutRoot: input.checkoutRoot,
      repositoryRoot: input.checkoutRoot,
      generatedAt: "2026-07-19T00:00:00.000Z",
      files: [],
      totals: {
        files: 0,
        additions: 0,
        deletions: 0,
        binaryFiles: 0,
        conflictedFiles: 0,
      },
      truncated: false,
      omittedFileCount: 0,
    }));

    await projections.save({
      sessionId: "session-changes",
      runtimeId: "runtime-changes",
      piSessionId: "pi-changes",
      projectId: "project-1",
      cwd: "/checkout/project",
      status: "completed",
      checkout: {
        root: "/source/repo",
        executionCheckoutRoot: "/checkout",
        diffRoot: "/checkout/project",
      },
      updatedAt: "2026-07-19T00:00:00.000Z",
    });

    const service = createBackendService({
      sessionProjectionStore: projections,
      sessionChangesReader: { read },
      piRpc: createFakePiRpcTransport(),
    });

    await expect(
      service.handleRequest({
        id: "req-changes",
        method: "get_session_changes",
        params: {
          sessionId: "session-changes",
          checkoutRoot: "/renderer/cannot/override/this",
        },
      }),
    ).resolves.toEqual({
      id: "req-changes",
      result: expect.objectContaining({ state: "clean" }),
    });
    expect(read).toHaveBeenCalledWith({
      sessionId: "session-changes",
      checkoutRoot: "/checkout",
      diffRoot: "/checkout/project",
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
    const sendResponse = service.handleRequest({
      id: "req-send",
      method: "send_prompt",
      params: { piSessionId: "pi-session-sdk", prompt: "Hello Pi" },
    });
    sdkSession.emit({
      type: "message_end",
      message: { role: "user", content: "Hello Pi" },
    });
    await sendResponse;

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

    await expect(
      service.handleRequest({
        id: "req-projections",
        method: "list_session_projections",
      }),
    ).resolves.toEqual({
      id: "req-projections",
      result: [
        expect.objectContaining({
          sessionId: "session-1",
          status: "completed",
          summary: expect.objectContaining({
            totalTokens: 42,
            totalCostUsd: 0.001,
          }),
        }),
      ],
    });

    await expect(
      service.handleRequest({
        id: "req-archive",
        method: "archive_session",
        params: { sessionId: "session-1" },
      }),
    ).resolves.toEqual({
      id: "req-archive",
      result: expect.objectContaining({
        sessionId: "session-1",
        status: "archived",
        archivedAt: expect.any(String),
      }),
    });
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

    const sendResponse = service.handleRequest({
      id: "req-send",
      method: "send_prompt",
      params: {
        piSessionId: "pi-session-sdk",
        prompt: "Hello Pi",
      },
    });
    sdkSession.emit({
      type: "message_end",
      message: { role: "user", content: "Hello Pi" },
    });

    await expect(sendResponse).resolves.toEqual({
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

  it("resumes cold sessions through SDK SessionManager.open by default", async () => {
    const sessionManager = {
      getCwd: vi.fn(() => process.cwd()),
      getSessionFile: vi.fn(
        () => "/Users/void/.pi/agent/sessions/project/pi-session-resumed.jsonl",
      ),
    };
    const sdkSession = createFakeSdkAgentSession();
    sdkSession.session.sessionId = "pi-session-resumed";
    sdkSession.session.sessionManager = sessionManager;
    sessionManagerOpen.mockReturnValue(sessionManager);
    createAgentSession.mockResolvedValue({ session: sdkSession.session });
    const projections = createInMemorySessionProjectionStore();
    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      sessionProjectionStore: projections,
      runtimeJournal: createInMemorySessionEventJournal(),
      piRpc: createFakePiRpcTransport(),
    });

    await expect(
      service.handleRequest({
        id: "req-resume",
        method: "resume_session",
        params: {
          sessionId: "session-resumed",
          projectId: "project-1",
          piSessionId: "pi-session-resumed",
          sessionFile: "/Users/void/.pi/agent/sessions/project/pi-session-resumed.jsonl",
          cwd: "/fallback/cwd",
        },
      }),
    ).resolves.toEqual({
      id: "req-resume",
      result: expect.objectContaining({
        sessionId: "session-resumed",
        runtimeId: "pi-sdk:session-resumed",
        piSessionId: "pi-session-resumed",
        cwd: process.cwd(),
        sessionFile: "/Users/void/.pi/agent/sessions/project/pi-session-resumed.jsonl",
      }),
    });
    expect(sessionManagerOpen).toHaveBeenCalledWith(
      "/Users/void/.pi/agent/sessions/project/pi-session-resumed.jsonl",
    );
    expect(createAgentSession).toHaveBeenCalledWith({
      cwd: process.cwd(),
      sessionManager,
    });
    await expect(projections.list()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "session-resumed",
        piSessionId: "pi-session-resumed",
        sessionFile: "/Users/void/.pi/agent/sessions/project/pi-session-resumed.jsonl",
      }),
    ]);
  });

  it("forks cold sessions through SDK SessionManager.open by default", async () => {
    const sourceSessionFile =
      "/Users/void/.pi/agent/sessions/project/pi-session-source.jsonl";
    const forkedSessionFile =
      "/Users/void/.pi/agent/sessions/project/pi-session-forked.jsonl";
    let currentSessionFile = sourceSessionFile;
    const sessionManager = {
      getCwd: vi.fn(() => process.cwd()),
      getSessionFile: vi.fn(() => currentSessionFile),
      getEntry: vi.fn(() => ({
        type: "message",
        id: "pi-entry-user-2",
        parentId: "pi-entry-parent",
        message: {
          role: "user",
          content: "Revise this branch",
        },
      })),
      createBranchedSession: vi.fn(() => {
        currentSessionFile = forkedSessionFile;

        return forkedSessionFile;
      }),
    };
    const sdkSession = createFakeSdkAgentSession();
    const journal = createInMemorySessionEventJournal();
    const projections = createInMemorySessionProjectionStore();

    sdkSession.session.sessionId = "pi-session-forked";
    sessionManagerOpen.mockReturnValue(sessionManager);
    createAgentSession.mockImplementation(async ({ sessionManager: manager }) => {
      sdkSession.session.sessionManager = manager;

      return { session: sdkSession.session };
    });
    journal.append({
      id: "evt-source-user",
      seq: 1,
      sessionId: "session-source",
      piSessionId: "pi-session-source",
      type: "message_update",
      ts: "2026-07-03T12:00:00.000Z",
      payload: {
        kind: "message",
        role: "user",
        body: "Revise this branch",
        piEntryId: "pi-entry-user-2",
      },
    });
    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      sessionProjectionStore: projections,
      runtimeJournal: journal,
      piRpc: createFakePiRpcTransport(),
    });

    await expect(
      service.handleRequest({
        id: "req-fork",
        method: "fork_session",
        params: {
          sessionId: "session-forked",
          projectId: "project-1",
          sourcePiSessionId: "pi-session-source",
          sourceSessionFile,
          piEntryId: "pi-entry-user-2",
          cwd: "/fallback/cwd",
        },
      }),
    ).resolves.toEqual({
      id: "req-fork",
      result: {
        selectedText: "Revise this branch",
        snapshot: expect.objectContaining({
          sessionId: "session-forked",
          runtimeId: "pi-sdk:session-forked",
          piSessionId: "pi-session-forked",
          cwd: process.cwd(),
          sessionFile: forkedSessionFile,
        }),
      },
    });
    expect(sessionManagerOpen).toHaveBeenCalledWith(sourceSessionFile);
    expect(sessionManager.getEntry).toHaveBeenCalledWith("pi-entry-user-2");
    expect(sessionManager.createBranchedSession).toHaveBeenCalledWith(
      "pi-entry-parent",
    );
    expect(createAgentSession).toHaveBeenCalledWith({
      cwd: process.cwd(),
      sessionManager,
    });
    await expect(projections.list()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "session-forked",
        piSessionId: "pi-session-forked",
        initialPrompt: "Revise this branch",
        sessionFile: forkedSessionFile,
      }),
    ]);
  });

  it("lists persisted Session Projections and repairs missing Pi session files", async () => {
    const projections = createInMemorySessionProjectionStore();

    await projections.save({
      sessionId: "session-1",
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-sdk",
      projectId: "project-1",
      cwd: process.cwd(),
      status: "idle",
      updatedAt: "2026-07-03T10:00:00.000Z",
    });

    const piSessionListAll = vi.fn(async () => [
      {
        id: "pi-session-sdk",
        path: "/Users/void/.pi/agent/sessions/project/pi-session-sdk.jsonl",
      },
    ]);
    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      sessionProjectionStore: projections,
      piSessionListAll,
      piRpc: createFakePiRpcTransport(),
    });

    await expect(
      service.handleRequest({
        id: "req-projections",
        method: "list_session_projections",
      }),
    ).resolves.toEqual({
      id: "req-projections",
      result: [
        expect.objectContaining({
          sessionId: "session-1",
          piSessionId: "pi-session-sdk",
          sessionFile: "/Users/void/.pi/agent/sessions/project/pi-session-sdk.jsonl",
        }),
      ],
    });
    expect(piSessionListAll).toHaveBeenCalledTimes(1);
    await expect(projections.list()).resolves.toEqual([
      expect.objectContaining({
        sessionFile: "/Users/void/.pi/agent/sessions/project/pi-session-sdk.jsonl",
      }),
    ]);
  });

  it("does not repeatedly scan all Pi sessions for unrecoverable Projections", async () => {
    const projections = createInMemorySessionProjectionStore();

    await projections.save({
      sessionId: "session-1",
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-missing",
      projectId: "project-1",
      cwd: process.cwd(),
      status: "idle",
      updatedAt: "2026-07-03T10:00:00.000Z",
    });

    const piSessionListAll = vi.fn(async () => []);
    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      sessionProjectionStore: projections,
      piSessionListAll,
      piRpc: createFakePiRpcTransport(),
    });

    await service.handleRequest({
      id: "req-projections-1",
      method: "list_session_projections",
    });
    await expect(
      service.handleRequest({
        id: "req-projections-2",
        method: "list_session_projections",
      }),
    ).resolves.toEqual({
      id: "req-projections-2",
      result: [
        expect.objectContaining({
          sessionId: "session-1",
          sessionFileMissing: true,
        }),
      ],
    });
    expect(piSessionListAll).toHaveBeenCalledTimes(1);
  });

  it("only saves projections whose session file repair changed", async () => {
    const projections = createInMemorySessionProjectionStore();
    const save = vi.spyOn(projections, "save");

    await projections.save({
      sessionId: "session-1",
      runtimeId: "pi-sdk:session-1",
      piSessionId: "pi-session-sdk",
      projectId: "project-1",
      cwd: process.cwd(),
      status: "idle",
      updatedAt: "2026-07-03T10:00:00.000Z",
    });
    await projections.save({
      sessionId: "session-2",
      runtimeId: "pi-sdk:session-2",
      piSessionId: "pi-session-present",
      projectId: "project-1",
      cwd: process.cwd(),
      status: "idle",
      sessionFile: "/Users/void/.pi/agent/sessions/project/pi-session-present.jsonl",
      updatedAt: "2026-07-03T10:01:00.000Z",
    });
    save.mockClear();

    const service = createBackendService({
      agentDir: fixtureAgentDir(),
      sessionProjectionStore: projections,
      piSessionListAll: vi.fn(async () => [
        {
          id: "pi-session-sdk",
          path: "/Users/void/.pi/agent/sessions/project/pi-session-sdk.jsonl",
        },
      ]),
      piRpc: createFakePiRpcTransport(),
    });

    await service.handleRequest({
      id: "req-projections",
      method: "list_session_projections",
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sessionFile: "/Users/void/.pi/agent/sessions/project/pi-session-sdk.jsonl",
      }),
    );
  });
});
