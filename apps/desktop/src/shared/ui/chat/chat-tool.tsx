import {
  ChatToolCalls,
  type ChatToolCallItem,
  type ChatToolCallStatus,
} from "@astryxdesign/core";

/**
 * Lifecycle of a tool invocation as rendered in the trace. Mirrors the state
 * union the runtime event pipeline produces (own type, not a vendor import).
 */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export type ChatToolItem = {
  argsText?: string;
  durationMs?: number;
  output?: string;
  state: ToolPartState;
  toolCallId?: string;
  toolName?: string;
};

const statusMap: Record<ToolPartState, ChatToolCallStatus> = {
  "input-streaming": "running",
  "input-available": "running",
  "output-available": "complete",
  "output-error": "error",
};

/** Argument keys that name what a tool acted on, most specific first. */
const TARGET_KEYS = [
  "path",
  "file_path",
  "filePath",
  "command",
  "cmd",
  "query",
  "pattern",
  "url",
  "name",
] as const;

const TARGET_MAX_LENGTH = 120;

export function toolTargetFromArgs(argsText: string | undefined): string | undefined {
  if (!argsText) {
    return undefined;
  }

  let args: unknown;
  try {
    args = JSON.parse(argsText);
  } catch {
    return undefined;
  }

  if (typeof args !== "object" || args === null) {
    return undefined;
  }

  for (const key of TARGET_KEYS) {
    const value = (args as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) {
      return value.length > TARGET_MAX_LENGTH
        ? `${value.slice(0, TARGET_MAX_LENGTH)}…`
        : value;
    }
  }

  return undefined;
}

export function formatToolDuration(durationMs: number | undefined): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }

  return durationMs < 1000
    ? `${Math.round(durationMs)}ms`
    : `${(durationMs / 1000).toFixed(1)}s`;
}

function toAstryxCall(tool: ChatToolItem, index: number): ChatToolCallItem {
  const resultDetail =
    tool.argsText != null || tool.output != null ? (
      <>
        {tool.argsText != null ? (
          <pre className="chat-tool__section" data-slot="chat-tool-args">
            {tool.argsText}
          </pre>
        ) : null}
        {tool.output !== undefined ? (
          <pre className="chat-tool__section" data-slot="chat-tool-result">
            {tool.output}
          </pre>
        ) : null}
      </>
    ) : undefined;

  return {
    name: tool.toolName ?? "tool",
    status: statusMap[tool.state],
    target: toolTargetFromArgs(tool.argsText),
    duration: formatToolDuration(tool.durationMs),
    errorMessage: tool.state === "output-error" ? tool.output : undefined,
    key: tool.toolCallId ?? `tool-${index}`,
    resultDetail,
  };
}

/**
 * Adapter over Astryx ChatToolCalls. One call renders as an inline row;
 * several collapse into the "N tool calls" summary Astryx provides. The
 * wrapper div carries the data-slot contract page tests assert on.
 */
export function ChatToolGroup({
  tools,
  className = "",
}: {
  tools: ChatToolItem[];
  className?: string;
}) {
  if (!tools.length) {
    return null;
  }

  return (
    <div
      className={`chat-tool ${className}`.trim()}
      data-slot="chat-tool-group"
      data-tool-count={tools.length}
      // Single-call groups keep the per-tool state contract on the wrapper.
      data-state={tools.length === 1 ? tools[0].state : undefined}
    >
      <ChatToolCalls calls={tools.map(toAstryxCall)} />
    </div>
  );
}

/**
 * Single-call sugar over ChatToolGroup, keeping the original data-slot and
 * data-state contract (detail stays unmounted while collapsed — Astryx
 * native behavior).
 */
export function ChatTool({
  argsText,
  durationMs,
  output,
  state,
  toolCallId,
  toolName,
  className = "",
}: ChatToolItem & { className?: string }) {
  return (
    <div
      className={`chat-tool ${className}`.trim()}
      data-slot="chat-tool"
      data-state={state}
      data-tool-call-id={toolCallId}
    >
      <ChatToolCalls
        calls={[toAstryxCall({ argsText, durationMs, output, state, toolCallId, toolName }, 0)]}
      />
    </div>
  );
}
