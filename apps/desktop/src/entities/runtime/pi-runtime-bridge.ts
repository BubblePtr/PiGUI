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
import type { AgentRuntimeEvent } from "@pigui/core";

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
  | "forking session"
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
  piEntryId?: string;
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
  // True on legacy events folded down from Agent Runtime Event payloads; the
  // projection must not mirror those back into the runtime model.
  derivedFromAgentEvent?: boolean;
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

// One step of a session's replay sequence, in Gateway seq order. Agent events
// rebuild the runtime model; chat entries are Gateway-minted legacy events
// (user echo, steer control, errors) that exist only on the legacy stream
// until the user-message protocol gap is settled (design doc §10).
export type SessionReplayEntry =
  | { kind: "agent"; entry: AgentRuntimeEventEntry }
  | { kind: "chat"; seq: number; event: PiRuntimeEvent };

export type PiSessionState = {
  piSessionId: string;
  runtimeId: string;
  projectId: string;
  cwd: string;
  sessionFile?: string;
  status: "idle" | "running" | "failed" | "completed";
  events: PiRuntimeEvent[];
  // Journaled boundary events from the Gateway snapshot; absent on bridges
  // that don't speak the Agent Runtime Event Model.
  replay?: SessionReplayEntry[];
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

export type ResumeSessionInput = {
  sessionId: string;
  projectId: string;
  piSessionId: string;
  cwd: string;
  sessionFile: string;
  checkout: ExecutionCheckout | null;
};

export type ForkSessionInput = {
  sessionId: string;
  projectId: string;
  sourcePiSessionId: string;
  sourceSessionFile: string;
  piEntryId: string;
  cwd: string;
  checkout: ExecutionCheckout | null;
};

export type ForkSessionResult = {
  state: PiSessionState;
  selectedText?: string;
};

// One Agent Runtime Event as delivered to the renderer: the protocol event
// plus the Gateway envelope ordering metadata the projection keys on.
export type AgentRuntimeEventEntry = {
  seq: number;
  timestamp: string;
  event: AgentRuntimeEvent;
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
  resumeSession?(input: ResumeSessionInput): Promise<PiSessionState>;
  forkSession?(input: ForkSessionInput): Promise<ForkSessionResult>;
  subscribeToEvents(piSessionId: string, listener: (event: PiRuntimeEvent) => void): () => void;
  // Optional until every bridge speaks the Agent Runtime Event Model; the
  // legacy PiRuntimeEvent stream above remains the compatibility surface.
  subscribeToAgentEvents?(
    piSessionId: string,
    listener: (entry: AgentRuntimeEventEntry) => void,
  ): () => void;
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

function cloneReplayEntry(entry: SessionReplayEntry): SessionReplayEntry {
  if (entry.kind === "agent") {
    return { kind: "agent", entry: { ...entry.entry } };
  }

  return { kind: "chat", seq: entry.seq, event: { ...entry.event } };
}

export function cloneSessionState(state: PiSessionState): PiSessionState {
  return {
    ...state,
    events: state.events.map((event) => ({ ...event })),
    ...(state.replay ? { replay: state.replay.map(cloneReplayEntry) } : {}),
    summary: state.summary ? { ...state.summary } : undefined,
  };
}
