import type {
  ExecutionCheckoutGitClient,
  PiRpcCommand,
  PiRpcTransport,
  PiRpcTransportStartInput,
  RuntimeGatewayEventEnvelope,
} from "@pigui/core";
import * as piSdk from "@earendil-works/pi-coding-agent";
import { buildConfigInventory } from "./config";
import { createNodeExecutionCheckoutGitClient } from "./execution-checkout";
import { createNodePiRpcProcess } from "./pi-rpc";
import { createPiSdkDriver } from "./pi-sdk-driver";
import {
  createPublicPiSdkRuntimeFactory,
  createPublicPiSdkRuntimeForker,
  createPublicPiSdkRuntimeResumer,
} from "./pi-sdk-runtime-adapter";
import {
  createRuntimeGatewayService,
  type PiRuntimeDriver,
  type RuntimeGatewayService,
} from "./runtime-gateway";
import {
  createFileSessionEventJournal,
  resolveDataDir,
  type SessionEventJournal,
} from "./session-event-journal";
import {
  createFileSessionProjectionStore,
  repairProjectionSessionFiles,
  type PiSessionListItem,
  type PersistedSessionProjection,
  type SessionProjectionStore,
} from "./session-projection-store";
import {
  buildSessionIndexWithCache,
  createSessionIndexCache,
  loadSessionDetail,
  resolveAgentDir,
  type SessionIndexCache,
} from "./sessions";

export type BackendRpcRequest = {
  id: string;
  method: string;
  params?: unknown;
};

export type BackendRpcResponse = {
  id: string;
  result?: unknown;
  error?: string;
};

export type BackendRpcEvent = {
  type: "event";
  event: RuntimeGatewayEventEnvelope;
};

export type BackendService = {
  handleRequest(request: BackendRpcRequest): Promise<BackendRpcResponse>;
  onEvent(listener: (event: BackendRpcEvent) => void): () => void;
};

export type BackendServiceOptions = {
  agentDir?: string;
  dataDir?: string;
  sessionCache?: SessionIndexCache;
  gitClient?: ExecutionCheckoutGitClient;
  piRpc?: PiRpcTransport;
  runtimeDriver?: PiRuntimeDriver;
  runtimeJournal?: SessionEventJournal;
  sessionProjectionStore?: SessionProjectionStore;
  piSessionListAll?: () => Promise<PiSessionListItem[]>;
};

export function createBackendService(options: BackendServiceOptions = {}): BackendService {
  const agentDir = options.agentDir ?? resolveAgentDir();
  const dataDir = options.dataDir ?? resolveDataDir();
  const sessionCache = options.sessionCache ?? createSessionIndexCache();
  const gitClient = options.gitClient ?? createNodeExecutionCheckoutGitClient();
  const piRpc = options.piRpc ?? createNodePiRpcProcess();
  const sessionProjectionStore =
    options.sessionProjectionStore ??
    createFileSessionProjectionStore({
      dataDir,
    });
  const piSessionListAll =
    options.piSessionListAll ??
    (async () => {
      const sessions = await piSdk.SessionManager.listAll();

      return sessions.map((session) => ({
        id: session.id,
        path: session.path,
      }));
    });
  const runtimeGateway = createRuntimeGatewayService({
    driver:
      options.runtimeDriver ??
      createPiSdkDriver({
        runtimeFactory: createPublicPiSdkRuntimeFactory({ sdk: piSdk }),
        runtimeForker: createPublicPiSdkRuntimeForker({ sdk: piSdk }),
        runtimeResumer: createPublicPiSdkRuntimeResumer({ sdk: piSdk }),
      }),
    projections: sessionProjectionStore,
    journal:
      options.runtimeJournal ??
      createFileSessionEventJournal({
        dataDir,
      }),
  });
  const listeners = new Set<(event: BackendRpcEvent) => void>();

  runtimeGateway.onEvent((event) => {
    for (const listener of listeners) {
      listener(event);
    }
  });

  return {
    async handleRequest(request) {
      try {
        return {
          id: request.id,
          result: await dispatchRequest({
            request,
            agentDir,
            sessionCache,
            gitClient,
            piRpc,
            sessionProjectionStore,
            piSessionListAll,
            runtimeGateway,
          }),
        };
      } catch (error) {
        return {
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    onEvent(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

async function dispatchRequest(input: {
  request: BackendRpcRequest;
  agentDir: string;
  sessionCache: SessionIndexCache;
  gitClient: ExecutionCheckoutGitClient;
  piRpc: PiRpcTransport;
  sessionProjectionStore: SessionProjectionStore;
  piSessionListAll: () => Promise<PiSessionListItem[]>;
  runtimeGateway: RuntimeGatewayService;
}) {
  const params = paramsRecord(input.request.params);

  if (isRuntimeGatewayMethod(input.request.method)) {
    const response = await input.runtimeGateway.handleRequest(input.request);

    if (response.error) {
      throw new Error(response.error);
    }

    return response.result;
  }

  switch (input.request.method) {
    case "list_sessions":
      return buildSessionIndexWithCache(input.agentDir, input.sessionCache);
    case "get_session_detail":
      return loadSessionDetail(input.agentDir, requiredString(params.id, "id"));
    case "list_session_projections":
      return listSessionProjections({
        store: input.sessionProjectionStore,
        piSessionListAll: input.piSessionListAll,
      });
    case "get_config_inventory":
      return buildConfigInventory(input.agentDir);
    case "is_git_repository":
      return input.gitClient.isGitRepository(requiredString(params.repoRoot, "repoRoot"));
    case "add_detached_worktree":
      await input.gitClient.addDetachedWorktree(requiredRecord(params.input, "input") as {
        repoRoot: string;
        checkoutRoot: string;
        sessionId: string;
      });
      return null;
    case "start_pi_rpc_runtime":
      await input.piRpc.start(requiredRecord(params.input, "input") as PiRpcTransportStartInput);
      return null;
    case "send_pi_rpc_command":
      return input.piRpc.send(requiredRecord(params.command, "command") as PiRpcCommand);
    case "stop_pi_rpc_runtime":
      await input.piRpc.stop?.();
      return null;
    default:
      throw new Error(`Unknown backend RPC method "${input.request.method}".`);
  }
}

async function listSessionProjections(input: {
  store: SessionProjectionStore;
  piSessionListAll: () => Promise<PiSessionListItem[]>;
}) {
  const projections = await input.store.list();

  const projectionsNeedingRepair = projections.filter(
    (projection) => !projection.sessionFile && !projection.sessionFileMissing,
  );

  if (!projectionsNeedingRepair.length) {
    return projections;
  }

  const repaired = repairProjectionSessionFiles(
    projections,
    await input.piSessionListAll(),
  );

  await Promise.all(
    repaired
      .filter((projection, index) =>
        projectionChangedForRepair(projections[index], projection),
      )
      .map((projection) => input.store.save(projection)),
  );

  return repaired;
}

function projectionChangedForRepair(
  before: PersistedSessionProjection | undefined,
  after: PersistedSessionProjection,
) {
  return (
    before?.sessionFile !== after.sessionFile ||
    before?.sessionFileMissing !== after.sessionFileMissing
  );
}

function isRuntimeGatewayMethod(method: string) {
  return (
    method === "create_session" ||
    method === "fork_session" ||
    method === "resume_session" ||
    method === "send_prompt" ||
    method === "queue_follow_up" ||
    method === "withdraw_queued_message" ||
    method === "steer_run" ||
    method === "stop_run" ||
    method === "get_runtime_snapshot"
  );
}

function paramsRecord(params: unknown) {
  return isRecord(params) ? params : {};
}

function requiredRecord(value: unknown, name: string) {
  if (!isRecord(value)) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
