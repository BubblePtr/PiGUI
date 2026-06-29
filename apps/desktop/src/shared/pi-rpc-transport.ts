import type { BackendRpcEvent } from "@pig/backend";
import type {
  PiRpcCommand,
  PiRpcRawEvent,
  PiRpcResponse,
  PiRpcTransport,
  PiRpcTransportStartInput,
} from "@/entities/runtime/pi-runtime-bridge";
import { invoke as invokeRuntime, onBackendEvent as onRuntimeBackendEvent } from "@/shared/runtime";

type InvokeCommand = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

type SubscribeBackendEvent = (listener: (event: BackendRpcEvent) => void) => () => void;

export type ElectronPiRpcTransportOptions = {
  invoke?: InvokeCommand;
  onBackendEvent?: SubscribeBackendEvent;
};

export function createElectronPiRpcTransport(
  options: ElectronPiRpcTransportOptions = {},
): PiRpcTransport {
  const invoke = options.invoke ?? invokeRuntime;
  const onBackendEvent = options.onBackendEvent ?? onRuntimeBackendEvent;
  const listeners = new Set<(event: PiRpcRawEvent) => void>();
  let unsubscribeBackendEvent: (() => void) | null = null;
  let started = false;

  const ensureListening = () => {
    if (unsubscribeBackendEvent) {
      return;
    }

    unsubscribeBackendEvent = onBackendEvent((event) => {
      if (event.type !== "event") {
        return;
      }

      for (const listener of listeners) {
        listener(event.event);
      }
    });
  };
  const releaseListenerIfIdle = () => {
    if (listeners.size || !unsubscribeBackendEvent) {
      return;
    }

    unsubscribeBackendEvent();
    unsubscribeBackendEvent = null;
  };

  return {
    async start(input: PiRpcTransportStartInput) {
      ensureListening();
      await invoke<void>("start_pi_rpc_runtime", { input });
      started = true;
    },

    async send(command: PiRpcCommand) {
      return invoke<PiRpcResponse>("send_pi_rpc_command", { command });
    },

    onEvent(listener) {
      listeners.add(listener);
      if (started) {
        ensureListening();
      }

      return () => {
        listeners.delete(listener);
        releaseListenerIfIdle();
      };
    },

    async stop() {
      await invoke<void>("stop_pi_rpc_runtime");
      started = false;
    },
  };
}
