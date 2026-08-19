// @pigui/core — shared kernel: the contracts crossing the renderer ↔ utilityProcess
// seam. The barrel is the only public surface; do not deep-import core internals.
// See docs/adr/0014-shared-kernel-core.md.

export type {
  MessageRole,
  SessionContentPart,
  TokenUsage,
  CostBreakdown,
  SessionTurn,
  SessionDetail,
  ModelUsage,
  NamedCount,
  Title,
  SessionSummary,
} from "./session";

export type {
  ConfigInventory,
  ExtensionInfo,
  SkillInfo,
  TemplateInfo,
} from "./config";

export {
  ENVIRONMENT_PREFLIGHT_DOCS,
  type EnvironmentPreflightCheckId,
  type EnvironmentPreflightCheckSeverity,
  type EnvironmentPreflightCheckStatus,
  type EnvironmentPreflightCheck,
  type EnvironmentPreflightReport,
  type EnvironmentPreflightStatus,
} from "./environment-preflight";

export {
  PROVIDER_AUTH_CATALOG,
  type ProviderAuthId,
  type ProviderAuthMode,
  type ProviderAuthStatusItem,
  type ProviderAuthStatusReport,
} from "./provider-auth";

export type {
  PiRpcCommand,
  PiRpcResponse,
  PiRpcRawEvent,
  PiRpcTransportStartInput,
  PiRpcTransport,
} from "./pi-rpc";

export type { ExecutionCheckoutGitClient } from "./checkout";

export type {
  SessionChanges,
  SessionChangesState,
  SessionChangedFile,
  SessionChangedFileKind,
} from "./session-changes";

export {
  surfaceForMessagePart,
  shouldJournalRuntimeEvent,
  AGENT_STATUS_SURFACES,
  type AgentRunPhase,
  type AgentBodyMode,
  type AgentSurface,
  type AgentEventOrigin,
  type AgentRunTrigger,
  type AgentRunOutcome,
  type AgentMessagePartType,
  type AgentStatusCode,
  type AgentMessagePartSnapshot,
  type AgentRuntimeEvent,
} from "./agent-runtime-event";

export {
  parseRuntimePromptImages,
  promptImageDataUrl,
  toPiImageContent,
  clonePromptImages,
  type RuntimePromptImage,
} from "./prompt-image";

export {
  createRuntimeGatewaySequencer,
  type RuntimeGatewayRequest,
  type RuntimeGatewayResponse,
  type RuntimeGatewayEventPayload,
  type RuntimeGatewayEventEnvelope,
  type RuntimeGatewayEventInput,
  type RuntimeGatewaySummary,
  type RuntimeThinkingLevel,
  type RuntimeModelInputModality,
  type RuntimeModelCapability,
  type RuntimeModelSelection,
  type RuntimeModelControls,
  type RuntimeGatewaySnapshot,
  type RuntimeGatewayQueuedMessage,
  type RuntimeToolSchema,
  type RuntimeToolSchemas,
  type RuntimeGatewaySequencer,
  type RuntimeGatewaySequencerOptions,
} from "./runtime-gateway";
