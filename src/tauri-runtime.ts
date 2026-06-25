import { invoke as invokeTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import browserSessionSummaries from "./fixtures/browser-session-summaries.json";
import type { SessionDetail } from "./session-detail";
import type { SessionSummary } from "./sessions";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

type InvokeArgs = Record<string, unknown>;

const emptyConfigInventory = {
  packages: [],
  extensions: [],
  skills: [],
  promptTemplates: [],
};
const browserSessionSummaryFixture = browserSessionSummaries as SessionSummary[];

export function isTauriRuntime() {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
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
            text: "This trace detail is generated from browser-session-summaries.json for web-only debugging outside Tauri.",
            payload: {},
          },
        ],
      },
    ],
  };
}

function invokeBrowserFallback<T>(command: string, args?: InvokeArgs): Promise<T> {
  switch (command) {
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
        new Error(`Tauri command "${command}" is unavailable outside the Tauri runtime.`),
      );
  }
}

export function invoke<T>(command: string, args?: InvokeArgs) {
  if (isTauriRuntime()) {
    return invokeTauri<T>(command, args);
  }

  return invokeBrowserFallback<T>(command, args);
}

export async function onWindowFocusChanged(refetch: () => unknown) {
  if (isTauriRuntime()) {
    return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void refetch();
      }
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
