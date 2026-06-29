// Test-only PiRpcTransport double — feeds scripted responses and emits raw
// events so the RPC adapter and backend service can be tested without a real
// `pi` process. Production transports live in pi-rpc-transport.ts.

import type {
  PiRpcCommand,
  PiRpcRawEvent,
  PiRpcResponse,
  PiRpcTransport,
  PiRpcTransportStartInput,
} from "@pig/core";

export type FakePiRpcTransportOptions = {
  sessionId?: string;
  model?: {
    provider?: string;
    id?: string;
  };
  now?: () => string;
  promptResponse?: PiRpcResponse;
};

export type FakePiRpcTransport = PiRpcTransport & {
  startCalls: PiRpcTransportStartInput[];
  commands: PiRpcCommand[];
  emitEvent(event: PiRpcRawEvent): void;
};

export function createFakePiRpcTransport(
  options: FakePiRpcTransportOptions = {},
): FakePiRpcTransport {
  const sessionId = options.sessionId ?? "pi-session-rpc";
  const model = options.model ?? {};
  const listeners = new Set<(event: PiRpcRawEvent) => void>();
  const startCalls: PiRpcTransportStartInput[] = [];
  const commands: PiRpcCommand[] = [];

  return {
    startCalls,
    commands,

    async start(input) {
      startCalls.push({ ...input, args: [...input.args] });
    },

    async send(command) {
      commands.push({ ...command });

      if (command.type === "get_state") {
        return {
          id: command.id,
          type: "response",
          command: "get_state",
          success: true,
          data: {
            sessionId,
            isStreaming: false,
            model: {
              provider: model.provider,
              id: model.id,
            },
          },
        };
      }

      if (command.type === "prompt") {
        return (
          options.promptResponse ?? {
            id: command.id,
            type: "response",
            command: "prompt",
            success: true,
          }
        );
      }

      return {
        id: command.id,
        type: "response",
        command: command.type,
        success: true,
      };
    },

    onEvent(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    emitEvent(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}
