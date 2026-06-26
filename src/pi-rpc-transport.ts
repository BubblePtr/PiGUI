import { listen as listenTauri, type Event as TauriEvent } from "@tauri-apps/api/event";
import type {
  PiRpcCommand,
  PiRpcRawEvent,
  PiRpcResponse,
  PiRpcTransport,
  PiRpcTransportStartInput,
} from "./pi-runtime-bridge";
import { invoke as invokeTauriRuntime } from "./tauri-runtime";

type InvokeTauriCommand = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

type ListenToPiRpcEvent = (
  eventName: string,
  handler: (event: { payload: PiRpcRawEvent }) => void,
) => Promise<() => void>;

export type TauriPiRpcTransportOptions = {
  invoke?: InvokeTauriCommand;
  listen?: ListenToPiRpcEvent;
};

const defaultListen: ListenToPiRpcEvent = (eventName, handler) =>
  listenTauri<PiRpcRawEvent>(
    eventName,
    handler as (event: TauriEvent<PiRpcRawEvent>) => void,
  );

export function createTauriPiRpcTransport(
  options: TauriPiRpcTransportOptions = {},
): PiRpcTransport {
  const invoke = options.invoke ?? invokeTauriRuntime;
  const listen = options.listen ?? defaultListen;
  const listeners = new Set<(event: PiRpcRawEvent) => void>();
  let unlistenPromise: Promise<() => void> | null = null;

  const ensureListening = () => {
    if (!unlistenPromise) {
      unlistenPromise = listen("pi-rpc-event", ({ payload }) => {
        for (const listener of listeners) {
          listener(payload);
        }
      });
    }

    return unlistenPromise;
  };
  const releaseTauriListenerIfIdle = () => {
    if (listeners.size || !unlistenPromise) {
      return;
    }

    const pendingUnlisten = unlistenPromise;

    unlistenPromise = null;
    void pendingUnlisten.then((unlisten) => {
      unlisten();
    });
  };

  return {
    async start(input: PiRpcTransportStartInput) {
      await invoke<void>("start_pi_rpc_runtime", { input });
    },

    async send(command: PiRpcCommand) {
      return invoke<PiRpcResponse>("send_pi_rpc_command", { command });
    },

    onEvent(listener) {
      listeners.add(listener);
      void ensureListening();

      return () => {
        listeners.delete(listener);
        releaseTauriListenerIfIdle();
      };
    },

    async stop() {
      await invoke<void>("stop_pi_rpc_runtime");
    },
  };
}
