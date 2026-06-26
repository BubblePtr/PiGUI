import {
  createFakePiRuntimeBridge,
  createPiRpcRuntimeBridge,
  type PiRpcTransport,
  type PiRuntimeBridge,
} from "./pi-runtime-bridge";
import { createTauriPiRpcTransport } from "./pi-rpc-transport";
import { isTauriRuntime } from "./tauri-runtime";

export type DefaultPiRuntimeBridgeOptions = {
  transport?: PiRpcTransport;
  now?: () => string;
};

export function createDefaultPiRuntimeBridge(
  options: DefaultPiRuntimeBridgeOptions = {},
): PiRuntimeBridge {
  if (!options.transport && !isTauriRuntime()) {
    return createFakePiRuntimeBridge({
      now: options.now,
    });
  }

  return createPiRpcRuntimeBridge({
    transport: options.transport ?? createTauriPiRpcTransport(),
    now: options.now,
  });
}
