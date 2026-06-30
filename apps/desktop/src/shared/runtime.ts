import browserSessionSummaries from "@/fixtures/browser-session-summaries.json";
import type { BackendRpcEvent } from "@pigui/backend";
import type { SessionDetail } from "@/pages/session-detail";
import type { SessionSummary } from "@/entities/session/sessions";

declare global {
  interface Window {
    pigui?: PiGUIRendererApi;
  }
}

export type PiGUIRendererApi = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  onBackendEvent(listener: (event: BackendRpcEvent) => void): () => void;
  onWindowFocusChanged(listener: () => void): () => void;
};

type InvokeArgs = Record<string, unknown>;

const emptyConfigInventory = {
  packages: [],
  extensions: [],
  skills: [],
  promptTemplates: [],
};
const browserSessionSummaryFixture = browserSessionSummaries as SessionSummary[];

export function isElectronRuntime() {
  return typeof window !== "undefined" && window.pigui !== undefined;
}

function browserSessionDetail(summary: SessionSummary): SessionDetail {
  return {
    id: summary.id,
    timestamp: summary.timestamp,
    project: summary.project,
    totalCostUsd: summary.totalCostUsd,
    totalTokens: summary.totalTokens,
    primaryModel: summary.primaryModel,
    turnCount: 3,
    durationSeconds: 420,
    turns: [
      {
        kind: "message",
        role: "user",
        timestamp: summary.timestamp,
        parts: [
          {
            partType: "text",
            text: `Inspect ${summary.project} trace usage and layout behavior.`,
            payload: {},
          },
        ],
      },
      {
        kind: "message",
        role: "assistant",
        timestamp: summary.timestamp,
        model: summary.primaryModel,
        usage: {
          inputTokens: Math.round(summary.totalTokens * 0.42),
          outputTokens: Math.round(summary.totalTokens * 0.38),
          cacheReadTokens: Math.round(summary.totalTokens * 0.16),
          cacheWriteTokens: Math.max(0, summary.totalTokens - Math.round(summary.totalTokens * 0.96)),
          totalTokens: summary.totalTokens,
        },
        cost: {
          inputUsd: summary.totalCostUsd * 0.34,
          outputUsd: summary.totalCostUsd * 0.5,
          cacheReadUsd: summary.totalCostUsd * 0.1,
          cacheWriteUsd: summary.totalCostUsd * 0.06,
          totalUsd: summary.totalCostUsd,
        },
        parts: [
          {
            partType: "thinking",
            text: [
              "Read the current workspace state.",
              "Compare the rendered layout with the target fixed-pane behavior.",
              "Keep trace output scoped to the detail panel.",
            ].join("\n"),
            payload: {},
          },
          {
            partType: "toolCall",
            name: "read_file",
            payload: {
              input: {
                path: "src/trace.tsx",
              },
            },
          },
          {
            partType: "toolResult",
            name: "read_file",
            text: "Trace workspace uses a fixed split layout with independent scroll panes.",
            payload: {},
          },
        ],
      },
      {
        kind: "annotation",
        title: "Browser development fixture",
        timestamp: summary.timestamp,
        parts: [
          {
            partType: "text",
            text: "This trace detail is generated from browser-session-summaries.json for web-only debugging outside Electron.",
            payload: {},
          },
        ],
      },
    ],
  };
}

function invokeBrowserFallback<T>(command: string, args?: InvokeArgs): Promise<T> {
  switch (command) {
    case "select_project_directory": {
      if (typeof window === "undefined") {
        return Promise.resolve(null as T);
      }

      const selectedPath = window.prompt("Project path");

      return Promise.resolve((selectedPath?.trim() || null) as T);
    }
    case "reveal_project_in_finder":
      return Promise.resolve(undefined as T);
    case "list_sessions":
      return Promise.resolve(browserSessionSummaryFixture as T);
    case "get_session_detail": {
      const id = typeof args?.id === "string" ? args.id : "";
      const summary = browserSessionSummaryFixture.find((session) => session.id === id);
      if (!summary) {
        return Promise.reject(new Error(`Browser session fixture "${id}" was not found.`));
      }
      return Promise.resolve(browserSessionDetail(summary) as T);
    }
    case "get_config_inventory":
      return Promise.resolve(emptyConfigInventory as T);
    default:
      return Promise.reject(
        new Error(`Backend command "${command}" is unavailable outside Electron.`),
      );
  }
}

export function invoke<T>(command: string, args?: InvokeArgs) {
  if (isElectronRuntime()) {
    return window.pigui!.invoke<T>(command, args);
  }

  return invokeBrowserFallback<T>(command, args);
}

export function selectProjectDirectory() {
  return invoke<string | null>("select_project_directory");
}

export function revealProjectInFinder(path: string) {
  return invoke<void>("reveal_project_in_finder", { path });
}

export async function onWindowFocusChanged(refetch: () => unknown) {
  if (isElectronRuntime()) {
    return window.pigui!.onWindowFocusChanged(() => {
      void refetch();
    });
  }

  if (typeof window === "undefined") {
    return () => {};
  }

  const handleFocus = () => {
    void refetch();
  };

  window.addEventListener("focus", handleFocus);
  return () => {
    window.removeEventListener("focus", handleFocus);
  };
}

export function onBackendEvent(listener: (event: BackendRpcEvent) => void) {
  if (!isElectronRuntime()) {
    return () => {};
  }

  return window.pigui!.onBackendEvent(listener);
}
