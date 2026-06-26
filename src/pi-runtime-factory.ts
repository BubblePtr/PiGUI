import {
  createPiRpcRuntimeBridge,
  type PiRpcTransport,
  type PiRuntimeBridge,
} from "./pi-runtime-bridge";
import { createTauriPiRpcTransport } from "./pi-rpc-transport";

export type DefaultPiRuntimeBridgeOptions = {
  transport?: PiRpcTransport;
  now?: () => string;
};

export function createDefaultPiRuntimeBridge(
  options: DefaultPiRuntimeBridgeOptions = {},
): PiRuntimeBridge {
  return createPiRpcRuntimeBridge({
    transport: options.transport ?? createTauriPiRpcTransport(),
    now: options.now,
  });
}
