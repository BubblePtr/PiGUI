import { ChatToolCalls, type ChatToolCallStatus } from "@astryxdesign/core";

/**
 * Lifecycle of a tool invocation as rendered in the trace. Mirrors the state
 * union the runtime event pipeline produces (own type, not a vendor import).
 */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

const statusMap: Record<ToolPartState, ChatToolCallStatus> = {
  "input-streaming": "running",
  "input-available": "running",
  "output-available": "complete",
  "output-error": "error",
};

/**
 * Thin adapter over Astryx ChatToolCalls in single-call mode. The wrapper div
 * carries the data-slot/data-state contract page tests assert on; Astryx owns
 * the row visuals and the expand/collapse interaction (detail stays unmounted
 * while collapsed).
 */
export function ChatTool({
  argsText,
  output,
  state,
  toolCallId,
  toolName,
  className = "",
}: {
  argsText?: string;
  output?: string;
  state: ToolPartState;
  toolCallId?: string;
  toolName?: string;
  className?: string;
}) {
  const resultDetail =
    argsText != null || output != null ? (
      <>
        {argsText != null ? (
          <pre className="chat-tool__section" data-slot="chat-tool-args">
            {argsText}
          </pre>
        ) : null}
        {output !== undefined ? (
          <pre className="chat-tool__section" data-slot="chat-tool-result">
            {output}
          </pre>
        ) : null}
      </>
    ) : undefined;

  return (
    <div
      className={`chat-tool ${className}`.trim()}
      data-slot="chat-tool"
      data-state={state}
      data-tool-call-id={toolCallId}
    >
      <ChatToolCalls
        calls={[
          {
            name: toolName ?? "tool",
            status: statusMap[state],
            errorMessage: state === "output-error" ? output : undefined,
            key: toolCallId,
            resultDetail,
          },
        ]}
      />
    </div>
  );
}
