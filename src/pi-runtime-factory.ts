import {
  createFakePiRuntimeBridge,
  createPiRpcRuntimeBridge,
  type PiRpcTransport,
  type PiRuntimeBridge,
} from "./pi-runtime-bridge";
import { createElectronPiRpcTransport } from "./pi-rpc-transport";
import { isElectronRuntime } from "./runtime";

export type DefaultPiRuntimeBridgeOptions = {
  transport?: PiRpcTransport;
  now?: () => string;
};

export function createDefaultPiRuntimeBridge(
  options: DefaultPiRuntimeBridgeOptions = {},
): PiRuntimeBridge {
  if (!options.transport && !isElectronRuntime()) {
    return createFakePiRuntimeBridge({
      now: options.now,
    });
  }

  return createPiRpcRuntimeBridge({
    transport: options.transport ?? createElectronPiRpcTransport(),
    now: options.now,
  });
}
