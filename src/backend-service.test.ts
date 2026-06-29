import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBackendService } from "./backend/service";
import { createFakePiRpcTransport } from "./pi-runtime-bridge";

function fixtureAgentDir() {
  return join(process.cwd(), "fixtures/pi-agent");
}

describe("backend RPC service", () => {
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

  it("routes Pi RPC commands and forwards events through the same service", async () => {
    const piRpc = createFakePiRpcTransport();
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
        id: "req-start",
        method: "start_pi_rpc_runtime",
        params: {
          input: {
            command: "pi",
            args: ["--mode", "rpc", "--session-id", "session-1"],
            cwd: process.cwd(),
          },
        },
      }),
    ).resolves.toEqual({ id: "req-start", result: null });
    await expect(
      service.handleRequest({
        id: "req-send",
        method: "send_pi_rpc_command",
        params: {
          command: {
            id: "command-1",
            type: "get_state",
          },
        },
      }),
    ).resolves.toEqual({
      id: "req-send",
      result: expect.objectContaining({
        id: "command-1",
        command: "get_state",
        success: true,
      }),
    });

    piRpc.emitEvent({ type: "message_end", message: { role: "assistant" } });

    expect(events).toEqual([
      {
        type: "event",
        event: {
          type: "message_end",
          message: { role: "assistant" },
        },
      },
    ]);
  });
});
