import type { PiRpcTransport, PiRuntimeBridge } from "./pi-runtime-bridge";
import { createPiRpcRuntimeBridge } from "./pi-rpc-runtime-bridge";
import { createInMemoryPiRuntimeBridge } from "./in-memory-pi-runtime-bridge";
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
    return createInMemoryPiRuntimeBridge({
      now: options.now,
    });
  }

  return createPiRpcRuntimeBridge({
    transport: options.transport ?? createElectronPiRpcTransport(),
    now: options.now,
  });
}
