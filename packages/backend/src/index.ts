// @pigui/backend — the relocatable backend service: session-log parsing, `pi`
// subprocess management, config inventory, and execution-checkout git work,
// behind the unified RPC protocol. Hosted in the Electron utilityProcess today
// (apps/desktop) and a headless server later (apps/server). See ADR-0015.

export {
  createBackendService,
  type BackendRpcRequest,
  type BackendRpcResponse,
  type BackendRpcEvent,
  type BackendService,
  type BackendServiceOptions,
} from "./service";
