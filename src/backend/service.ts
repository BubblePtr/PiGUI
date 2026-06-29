import type { ExecutionCheckoutGitClient } from "../execution-checkout";
import type { PiRpcCommand, PiRpcRawEvent, PiRpcTransport, PiRpcTransportStartInput } from "../pi-runtime-bridge";
import { buildConfigInventory } from "./config";
import { createNodeExecutionCheckoutGitClient } from "./execution-checkout";
import { createNodePiRpcProcess } from "./pi-rpc";
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
  event: PiRpcRawEvent;
};

export type BackendService = {
  handleRequest(request: BackendRpcRequest): Promise<BackendRpcResponse>;
  onEvent(listener: (event: BackendRpcEvent) => void): () => void;
};

export type BackendServiceOptions = {
  agentDir?: string;
  sessionCache?: SessionIndexCache;
  gitClient?: ExecutionCheckoutGitClient;
  piRpc?: PiRpcTransport;
};

export function createBackendService(options: BackendServiceOptions = {}): BackendService {
  const agentDir = options.agentDir ?? resolveAgentDir();
  const sessionCache = options.sessionCache ?? createSessionIndexCache();
  const gitClient = options.gitClient ?? createNodeExecutionCheckoutGitClient();
  const piRpc = options.piRpc ?? createNodePiRpcProcess();
  const listeners = new Set<(event: BackendRpcEvent) => void>();

  piRpc.onEvent((event) => {
    const rpcEvent: BackendRpcEvent = { type: "event", event };

    for (const listener of listeners) {
      listener(rpcEvent);
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
}) {
  const params = paramsRecord(input.request.params);

  switch (input.request.method) {
    case "list_sessions":
      return buildSessionIndexWithCache(input.agentDir, input.sessionCache);
    case "get_session_detail":
      return loadSessionDetail(input.agentDir, requiredString(params.id, "id"));
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
