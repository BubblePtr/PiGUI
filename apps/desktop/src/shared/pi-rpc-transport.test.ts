import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PiRpcRawEvent, PiRpcResponse } from "@/entities/runtime/pi-runtime-bridge";
import {
  createElectronPiRpcTransport,
  type ElectronPiRpcTransportOptions,
} from "@/shared/pi-rpc-transport";
import type { BackendRpcEvent } from "@pig/backend";

describe("Pi RPC Electron transport", () => {
  it("delegates runtime commands through invoke and forwards backend Pi RPC events", async () => {
    const invocations: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const unlisten = vi.fn();
    const onBackendEvent = vi.fn(
      (handler: (event: BackendRpcEvent) => void) => {
        eventHandlers.push(handler);

        return unlisten;
      },
    );
    const invoke: NonNullable<ElectronPiRpcTransportOptions["invoke"]> = async <T,>(
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
    const transport = createElectronPiRpcTransport({ invoke, onBackendEvent });
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
      type: "event",
      event: {
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
    expect(onBackendEvent).toHaveBeenCalledWith(expect.any(Function));
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

  it("fails startup when the renderer cannot subscribe to backend events", async () => {
    const onBackendEvent = vi.fn(() => {
      throw new Error("listen denied");
    });
    const invocations: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: NonNullable<ElectronPiRpcTransportOptions["invoke"]> = async <T,>(
      command: string,
      args?: Record<string, unknown>,
    ) => {
      invocations.push({ command, args });

      return undefined as T;
    };
    const transport = createElectronPiRpcTransport({ invoke, onBackendEvent });

    transport.onEvent(() => {});

    await expect(
      transport.start({
        command: "pi",
        args: ["--mode", "rpc", "--session-id", "session-1"],
        cwd: "/Users/void/code/opensource/Pig",
      }),
    ).rejects.toThrow("listen denied");
    expect(invocations).toEqual([]);
  });

  it("keeps the renderer transport free of Node process imports", () => {
    const source = readFileSync(join(process.cwd(), "apps/desktop/src/shared/pi-rpc-transport.ts"), "utf8");

    expect(source).not.toContain("node:child_process");
    expect(source).not.toContain("node:stream");
  });
});
