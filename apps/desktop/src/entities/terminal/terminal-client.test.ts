import { describe, expect, it, vi } from "vitest";
import type { BackendRpcEvent } from "@pigui/backend";
import {
  attachTerminal,
  closeTerminal,
  listTerminals,
  openTerminal,
  resizeTerminal,
  sendTerminalInput,
  subscribeTerminalEvents,
  type TerminalClientOptions,
  type TerminalInstanceInfo,
} from "@/entities/terminal/terminal-client";

function terminalEvent(
  type: string,
  payload: Record<string, unknown>,
): BackendRpcEvent {
  return {
    type: "event",
    event: {
      id: `event-${type}`,
      seq: 1,
      sessionId: "session-1",
      piSessionId: "pi-session-1",
      type,
      ts: "2026-09-02T10:00:00.000Z",
      payload,
    },
  } as BackendRpcEvent;
}

describe("terminal client", () => {
  it("sends each terminal command through invoke with the contract's arguments", async () => {
    const invocations: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const instances: TerminalInstanceInfo[] = [
      {
        terminalId: "term-1",
        sessionId: "session-1",
        cwd: "/checkout",
        status: "running",
      },
    ];
    const invoke: NonNullable<TerminalClientOptions["invoke"]> = async <T,>(
      command: string,
      args?: Record<string, unknown>,
    ) => {
      invocations.push({ command, args });

      if (command === "list_terminals" || command === "open_terminal") {
        return instances as T;
      }
      if (command === "attach_terminal") {
        return { scrollback: "buffered output" } as T;
      }

      return null as T;
    };
    const options = { invoke };

    expect(await listTerminals("session-1", options)).toEqual(instances);
    expect(
      await openTerminal({ sessionId: "session-1", cols: 80, rows: 24 }, options),
    ).toEqual(instances);
    expect(await attachTerminal("term-1", options)).toEqual({
      scrollback: "buffered output",
    });
    expect(await sendTerminalInput("term-1", "ls\n", options)).toBeNull();
    expect(await resizeTerminal("term-1", 120, 40, options)).toBeNull();
    expect(await closeTerminal("term-1", options)).toBeNull();
    expect(invocations).toEqual([
      { command: "list_terminals", args: { sessionId: "session-1" } },
      {
        command: "open_terminal",
        args: { sessionId: "session-1", cols: 80, rows: 24 },
      },
      { command: "attach_terminal", args: { terminalId: "term-1" } },
      { command: "terminal_input", args: { terminalId: "term-1", data: "ls\n" } },
      {
        command: "resize_terminal",
        args: { terminalId: "term-1", cols: 120, rows: 40 },
      },
      { command: "close_terminal", args: { terminalId: "term-1" } },
    ]);
  });

  it("routes terminal_output and terminal_exit events by terminalId", () => {
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const unlisten = vi.fn();
    const onBackendEvent = vi.fn((handler: (event: BackendRpcEvent) => void) => {
      eventHandlers.push(handler);

      return unlisten;
    });
    const outputs: Array<{ terminalId: string; data: string }> = [];
    const exits: Array<{ terminalId: string; exitCode: number }> = [];

    const unsubscribe = subscribeTerminalEvents(
      {
        onOutput: (terminalId, data) => outputs.push({ terminalId, data }),
        onExit: (terminalId, exitCode) => exits.push({ terminalId, exitCode }),
      },
      { onBackendEvent },
    );

    expect(eventHandlers).toHaveLength(1);

    eventHandlers[0]?.(terminalEvent("terminal_output", {
      terminalId: "term-1",
      data: "chunk-a",
    }));
    eventHandlers[0]?.(terminalEvent("terminal_output", {
      terminalId: "term-2",
      data: "chunk-b",
    }));
    eventHandlers[0]?.(terminalEvent("terminal_exit", {
      terminalId: "term-1",
      exitCode: 0,
    }));
    // Other runtime events and malformed terminal payloads never reach handlers.
    eventHandlers[0]?.(terminalEvent("message_end", { message: {} }));
    eventHandlers[0]?.(terminalEvent("terminal_output", { data: "no id" }));
    eventHandlers[0]?.(terminalEvent("terminal_output", {
      terminalId: "term-1",
      data: 42,
    }));
    eventHandlers[0]?.({ type: "response" } as unknown as BackendRpcEvent);
    unsubscribe();

    expect(outputs).toEqual([
      { terminalId: "term-1", data: "chunk-a" },
      { terminalId: "term-2", data: "chunk-b" },
    ]);
    expect(exits).toEqual([{ terminalId: "term-1", exitCode: 0 }]);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("tolerates events arriving with no matching handler registered", () => {
    const eventHandlers: Array<(event: BackendRpcEvent) => void> = [];
    const onBackendEvent = vi.fn((handler: (event: BackendRpcEvent) => void) => {
      eventHandlers.push(handler);

      return () => {};
    });

    subscribeTerminalEvents({}, { onBackendEvent });

    expect(() =>
      eventHandlers[0]?.(terminalEvent("terminal_output", {
        terminalId: "term-1",
        data: "chunk",
      })),
    ).not.toThrow();
  });
});
