// Pi Runtime Bridge — the renderer contract for live Pi sessions. Electron uses
// the Runtime Gateway adapter by default; the in-memory and legacy RPC adapters
// remain available for browser fallback and driver-level regression tests.

export type {
  PiRpcCommand,
  PiRpcResponse,
  PiRpcRawEvent,
  PiRpcTransportStartInput,
  PiRpcTransport,
} from "@pigui/core";

export type ExecutionCheckout = {
  mode: "foreground-local" | "managed-worktree";
  root: string;
  runtimeCwd: string;
  repoRoot?: string;
  projectRoot?: string;
  projectRelativePath?: string;
  executionCheckoutRoot?: string;
  diffRoot?: string;
  sessionBound?: boolean;
  disposable?: boolean;
  cleanupCandidate?: boolean;
  permanent?: boolean;
  createdAt?: string;
  cleanupMarkedAt?: string;
  promotedAt?: string;
};

export type RuntimeBridgeFailureStage =
  | "starting runtime"
  | "sending prompt"
  | "queuing message"
  | "withdrawing queued message"
  | "steering run"
  | "stopping run";

export type PiRuntimeBridgeErrorDetail = {
  stage: RuntimeBridgeFailureStage;
  message: string;
};

export class PiRuntimeBridgeError extends Error {
  stage: RuntimeBridgeFailureStage;

  constructor(detail: PiRuntimeBridgeErrorDetail) {
    super(detail.message);
    this.name = "PiRuntimeBridgeError";
    this.stage = detail.stage;
  }
}

export type PiRuntimeHandle = {
  runtimeId: string;
  sessionId: string;
  projectId: string;
  checkout: ExecutionCheckout;
  status: "ready";
};

export type PiRuntimeSummary = {
  provider: string | null;
  model: string | null;
  totalTokens: number;
  totalCostUsd: number;
};

export type PiRuntimeEvent = {
  id: string;
  piSessionId: string;
  messageId?: string;
  toolCallId?: string;
  kind:
    | "message"
    | "thinking"
    | "tool-call"
    | "tool-result"
    | "error"
    | "usage"
    | "status"
    | "control";
  role?: "user" | "assistant";
  title?: string;
  body: string;
  bodyFormat?: "full" | "delta";
  phase?: "partial" | "delta" | "final";
  timestamp: string;
  summary?: Partial<PiRuntimeSummary>;
};

export type PiQueuedMessageStatus = "pending" | "processing" | "withdrawn";

export type PiQueuedMessage = {
  id: string;
  piSessionId: string;
  body: string;
  status: PiQueuedMessageStatus;
  createdAt: string;
  processingStartedAt?: string;
  withdrawnAt?: string;
};

export type PiSessionState = {
  piSessionId: string;
  runtimeId: string;
  projectId: string;
  cwd: string;
  status: "idle" | "running" | "failed" | "completed";
  events: PiRuntimeEvent[];
  summary?: PiRuntimeSummary;
  updatedAt: string;
};

export type PiRuntimeAcceptedPrompt = {
  accepted: true;
  piSessionId: string;
  event: PiRuntimeEvent;
};

export type StartRuntimeInput = {
  sessionId: string;
  projectId: string;
  checkout: ExecutionCheckout;
};

export type CreatePiSessionStateInput = {
  runtimeId: string;
  projectId: string;
  cwd: string;
};

export type SendInitialPromptInput = {
  piSessionId: string;
  prompt: string;
};

export type QueueFollowUpInput = {
  piSessionId: string;
  message: string;
};

export type WithdrawQueuedMessageInput = {
  piSessionId: string;
  queuedMessageId: string;
};

export type SteerRunInput = {
  piSessionId: string;
  message: string;
};

export type AbortRunInput = {
  piSessionId: string;
};

export type PiRuntimeBridge = {
  startRuntime(input: StartRuntimeInput): Promise<PiRuntimeHandle>;
  createPiSessionState(input: CreatePiSessionStateInput): Promise<PiSessionState>;
  sendInitialPrompt(input: SendInitialPromptInput): Promise<PiRuntimeAcceptedPrompt>;
  queueFollowUp(input: QueueFollowUpInput): Promise<PiQueuedMessage>;
  withdrawQueuedMessage(input: WithdrawQueuedMessageInput): Promise<PiQueuedMessage>;
  steerRun(input: SteerRunInput): Promise<PiRuntimeEvent>;
  abortRun(input: AbortRunInput): Promise<PiRuntimeEvent>;
  getSessionState(piSessionId: string): Promise<PiSessionState>;
  subscribeToEvents(piSessionId: string, listener: (event: PiRuntimeEvent) => void): () => void;
};

// Domain helpers shared by both adapters — pure operations on the contract types.

export function defaultRuntimeSummary(
  overrides: Partial<PiRuntimeSummary> = {},
): PiRuntimeSummary {
  return {
    provider: null,
    model: null,
    totalTokens: 0,
    totalCostUsd: 0,
    ...overrides,
  };
}

export function cloneSessionState(state: PiSessionState): PiSessionState {
  return {
    ...state,
    events: state.events.map((event) => ({ ...event })),
    summary: state.summary ? { ...state.summary } : undefined,
  };
}
