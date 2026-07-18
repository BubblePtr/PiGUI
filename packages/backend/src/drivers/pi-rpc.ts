import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  PiRpcCommand,
  PiRpcRawEvent,
  PiRpcResponse,
  PiRpcTransport,
  PiRpcTransportStartInput,
} from "@pigui/core";

export type NodePiRpcProcessOptions = {
  responseTimeoutMs?: number;
};

type PendingResponse = {
  resolve: (response: PiRpcResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export function createNodePiRpcProcess(options: NodePiRpcProcessOptions = {}): PiRpcTransport {
  const responseTimeoutMs = options.responseTimeoutMs ?? 30_000;
  const listeners = new Set<(event: PiRpcRawEvent) => void>();
  const pendingResponses = new Map<string, PendingResponse>();
  let child: ChildProcessWithoutNullStreams | undefined;

  const emit = (event: PiRpcRawEvent) => {
    for (const listener of listeners) {
      listener(event);
    }
  };

  const rejectPending = (error: Error) => {
    for (const pending of pendingResponses.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    pendingResponses.clear();
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      emit({
        type: "error",
        error: `Pi RPC emitted non-JSON stdout: ${trimmed}`,
      });
      return;
    }

    if (isPiRpcResponse(value)) {
      const pending = pendingResponses.get(value.id);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingResponses.delete(value.id);
        pending.resolve(value);
      }
      return;
    }

    if (isRecord(value)) {
      emit(value);
    }
  };

  return {
    async start(input: PiRpcTransportStartInput) {
      await this.stop?.();

      child = spawn(input.command, input.args, {
        cwd: input.cwd,
        stdio: "pipe",
      });

      createInterface({ input: child.stdout }).on("line", handleLine);
      createInterface({ input: child.stderr }).on("line", (line) => {
        if (line.trim()) {
          emit({ type: "error", error: line });
        }
      });
      child.once("error", (error) => {
        emit({ type: "error", error: error.message });
        rejectPending(error);
      });
      child.once("exit", (code, signal) => {
        rejectPending(new Error(`Pi RPC process exited with ${signal ?? code ?? "unknown status"}`));
      });
    },

    async send(command: PiRpcCommand) {
      if (!child?.stdin.writable) {
        throw new Error("Pi RPC runtime is not started");
      }

      const commandId = typeof command.id === "string" ? command.id : undefined;
      if (!commandId) {
        throw new Error("Pi RPC command must include a string id");
      }

      const encoded = JSON.stringify(command);

      return new Promise<PiRpcResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingResponses.delete(commandId);
          reject(new Error(`timed out waiting for Pi RPC response ${commandId}`));
        }, responseTimeoutMs);

        pendingResponses.set(commandId, { resolve, reject, timeout });
        child!.stdin.write(`${encoded}\n`, (error) => {
          if (error) {
            clearTimeout(timeout);
            pendingResponses.delete(commandId);
            reject(error);
          }
        });
      });
    },

    onEvent(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    async stop() {
      if (!child) {
        return;
      }

      const processToStop = child;
      child = undefined;
      processToStop.kill();
      rejectPending(new Error("Pi RPC runtime stopped"));
    },
  };
}

function isPiRpcResponse(value: unknown): value is PiRpcResponse & { id: string } {
  return (
    isRecord(value) &&
    value.type === "response" &&
    typeof value.id === "string" &&
    typeof value.command === "string" &&
    typeof value.success === "boolean"
  );
}

function isRecord(value: unknown): value is PiRpcRawEvent {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
