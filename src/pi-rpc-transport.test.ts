import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PiRpcRawEvent, PiRpcResponse } from "./pi-runtime-bridge";
import {
  createTauriPiRpcTransport,
  type TauriPiRpcTransportOptions,
} from "./pi-rpc-transport";

describe("Pi RPC Tauri transport", () => {
  it("delegates runtime commands through Tauri invoke and forwards Pi RPC events", async () => {
    const invocations: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const eventHandlers: Array<(event: { payload: PiRpcRawEvent }) => void> = [];
    const unlisten = vi.fn();
    const listen = vi.fn(
      async (_eventName: string, handler: (event: { payload: PiRpcRawEvent }) => void) => {
        eventHandlers.push(handler);

        return unlisten;
      },
    );
    const invoke: NonNullable<TauriPiRpcTransportOptions["invoke"]> = async <T,>(
      command: string,
      args?: Record<string, unknown>,
    ) => {
      invocations.push({ command, args });

      if (command === "send_pi_rpc_command") {
        return ({
          id: "req-1",
          type: "response",
          command: "get_state",
          success: true,
          data: { sessionId: "session-1" },
        } satisfies PiRpcResponse) as T;
      }

      return undefined as T;
    };
    const transport = createTauriPiRpcTransport({ invoke, listen });
    const events: PiRpcRawEvent[] = [];

    const unsubscribe = transport.onEvent((event) => {
      events.push(event);
    });

    await transport.start({
      command: "pi",
      args: ["--mode", "rpc", "--session-id", "session-1"],
      cwd: "/Users/void/code/opensource/Pig",
    });
    const response = await transport.send({
      id: "req-1",
      type: "get_state",
    });

    eventHandlers[0]?.({
      payload: {
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Ready." }],
        },
      },
    });
    unsubscribe();
    await Promise.resolve();

    expect(response).toMatchObject({
      command: "get_state",
      success: true,
      data: { sessionId: "session-1" },
    });
    expect(invocations).toEqual([
      {
        command: "start_pi_rpc_runtime",
        args: {
          input: {
            command: "pi",
            args: ["--mode", "rpc", "--session-id", "session-1"],
            cwd: "/Users/void/code/opensource/Pig",
          },
        },
      },
      {
        command: "send_pi_rpc_command",
        args: {
          command: {
            id: "req-1",
            type: "get_state",
          },
        },
      },
    ]);
    expect(listen).toHaveBeenCalledWith("pi-rpc-event", expect.any(Function));
    expect(events).toEqual([
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Ready." }],
        },
      },
    ]);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("keeps the WebView transport free of Node process imports", () => {
    const source = readFileSync(join(process.cwd(), "src/pi-rpc-transport.ts"), "utf8");

    expect(source).not.toContain("node:child_process");
    expect(source).not.toContain("node:stream");
  });
});
