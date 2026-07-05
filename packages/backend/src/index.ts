// @pigui/backend — the relocatable backend service: session-log parsing,
// Runtime Gateway dispatch, Pi driver management, config inventory, and
// execution-checkout git work. Hosted in the Electron utilityProcess today and
// a headless server later.

export {
  createBackendService,
  type BackendRpcRequest,
  type BackendRpcResponse,
  type BackendRpcEvent,
  type BackendService,
  type BackendServiceOptions,
} from "./service";

export {
  createRuntimeGatewayService,
  type RuntimeGatewayDriverEvent,
  type CreateRuntimeSessionInput,
  type SendPromptInput,
  type QueueFollowUpInput,
  type WithdrawQueuedMessageInput,
  type SteerRunInput,
  type StopRunInput,
  type PiRuntimeDriver,
  type RuntimeGatewayBackendEvent,
  type RuntimeGatewayService,
  type RuntimeGatewayServiceOptions,
} from "./runtime-gateway";

export {
  createPiRpcProcessDriver,
  type PiRpcProcessDriverOptions,
} from "./pi-rpc-driver";

export {
  PiSdkDriverUnsupportedError,
  createPiSdkDriver,
  type PiSdkDriverOptions,
  type PiSdkPackageModule,
  type PiSdkQueuedMessage,
  type PiSdkRuntimeEvent,
  type PiSdkRuntimeFactory,
  type PiSdkSessionRuntime,
  type PiSdkSnapshotPatch,
} from "./pi-sdk-driver";

export {
  type PersistedSessionProjection,
  type SessionProjectionStore,
} from "./session-projection-store";
