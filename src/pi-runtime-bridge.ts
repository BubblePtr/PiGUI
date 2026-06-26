export type ExecutionCheckout = {
  mode: "foreground-local";
  root: string;
  runtimeCwd: string;
};

export type RuntimeBridgeFailureStage = "starting runtime" | "sending prompt";

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

export type PiRuntimeEvent = {
  id: string;
  piSessionId: string;
  kind: "message";
  role: "user" | "assistant";
  body: string;
  timestamp: string;
};

export type PiSessionState = {
  piSessionId: string;
  runtimeId: string;
  projectId: string;
  cwd: string;
  status: "idle" | "running" | "failed" | "completed";
  events: PiRuntimeEvent[];
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

export type PiRuntimeBridge = {
  startRuntime(input: StartRuntimeInput): Promise<PiRuntimeHandle>;
  createPiSessionState(input: CreatePiSessionStateInput): Promise<PiSessionState>;
  sendInitialPrompt(input: SendInitialPromptInput): Promise<PiRuntimeAcceptedPrompt>;
  getSessionState(piSessionId: string): Promise<PiSessionState>;
};

export type FakePiRuntimeBridge = PiRuntimeBridge & {
  restoreSessionState(state: PiSessionState): Promise<PiSessionState>;
};

type FakeBridgeFailurePoint = "start-runtime" | "create-pi-session-state" | "send-initial-prompt";

export type FakePiRuntimeBridgeOptions = {
  now?: () => string;
  failAt?: FakeBridgeFailurePoint;
  failureMessage?: string;
};

function cloneSessionState(state: PiSessionState): PiSessionState {
  return {
    ...state,
    events: state.events.map((event) => ({ ...event })),
  };
}

export function createFakePiRuntimeBridge(
  options: FakePiRuntimeBridgeOptions = {},
): FakePiRuntimeBridge {
  const now = options.now ?? (() => new Date().toISOString());
  const runtimes = new Map<string, PiRuntimeHandle>();
  const states = new Map<string, PiSessionState>();
  let runtimeCounter = 0;
  let sessionCounter = 0;
  let eventCounter = 0;

  const fail = (stage: RuntimeBridgeFailureStage): never => {
    throw new PiRuntimeBridgeError({
      stage,
      message: options.failureMessage ?? `Fake Pi Runtime Bridge failed while ${stage}.`,
    });
  };

  return {
    async startRuntime(input) {
      if (options.failAt === "start-runtime") {
        fail("starting runtime");
      }

      runtimeCounter += 1;
      const runtime: PiRuntimeHandle = {
        runtimeId: `runtime-${runtimeCounter}`,
        sessionId: input.sessionId,
        projectId: input.projectId,
        checkout: input.checkout,
        status: "ready",
      };

      runtimes.set(runtime.runtimeId, runtime);

      return { ...runtime, checkout: { ...runtime.checkout } };
    },

    async createPiSessionState(input) {
      if (options.failAt === "create-pi-session-state") {
        fail("starting runtime");
      }

      if (!runtimes.has(input.runtimeId)) {
        throw new PiRuntimeBridgeError({
          stage: "starting runtime",
          message: `Runtime "${input.runtimeId}" was not found.`,
        });
      }

      sessionCounter += 1;
      const state: PiSessionState = {
        piSessionId: `pi-session-${sessionCounter}`,
        runtimeId: input.runtimeId,
        projectId: input.projectId,
        cwd: input.cwd,
        status: "idle",
        events: [],
        updatedAt: now(),
      };

      states.set(state.piSessionId, state);

      return cloneSessionState(state);
    },

    async sendInitialPrompt(input) {
      if (options.failAt === "send-initial-prompt") {
        fail("sending prompt");
      }

      const state = states.get(input.piSessionId);

      if (!state) {
        throw new PiRuntimeBridgeError({
          stage: "sending prompt",
          message: `Pi session "${input.piSessionId}" was not found.`,
        });
      }

      eventCounter += 1;
      const event: PiRuntimeEvent = {
        id: `runtime-event-${eventCounter}`,
        piSessionId: input.piSessionId,
        kind: "message",
        role: "user",
        body: input.prompt,
        timestamp: now(),
      };

      state.status = "running";
      state.updatedAt = event.timestamp;
      state.events = [...state.events, event];

      return {
        accepted: true,
        piSessionId: input.piSessionId,
        event: { ...event },
      };
    },

    async getSessionState(piSessionId) {
      const state = states.get(piSessionId);

      if (!state) {
        throw new PiRuntimeBridgeError({
          stage: "starting runtime",
          message: `Pi session "${piSessionId}" was not found.`,
        });
      }

      return cloneSessionState(state);
    },

    async restoreSessionState(state) {
      const restoredState = cloneSessionState(state);

      states.set(restoredState.piSessionId, restoredState);

      return cloneSessionState(restoredState);
    },
  };
}
