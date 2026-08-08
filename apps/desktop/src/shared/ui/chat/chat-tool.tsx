import { Collapsible } from "@base-ui-components/react/collapsible";
import { ChevronRight } from "@/shared/ui/icons";

/**
 * Lifecycle of a tool invocation as rendered in the trace. Mirrors the state
 * union the runtime event pipeline produces (own type, not a vendor import).
 */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

const stateLabels: Record<ToolPartState, string> = {
  "input-streaming": "Running",
  "input-available": "Running",
  "output-available": "Done",
  "output-error": "Failed",
};

export function ChatTool({
  argsText,
  defaultExpanded = false,
  output,
  state,
  toolCallId,
  toolName,
  triggerPrefix = "",
  className = "",
}: {
  argsText?: string;
  defaultExpanded?: boolean;
  output?: string;
  state: ToolPartState;
  toolCallId?: string;
  toolName?: string;
  triggerPrefix?: string;
  className?: string;
}) {
  return (
    <Collapsible.Root
      className={`chat-tool ${className}`.trim()}
      data-slot="chat-tool"
      data-state={state}
      data-tool-call-id={toolCallId}
      defaultOpen={defaultExpanded}
    >
      <Collapsible.Trigger className="chat-tool__trigger" data-slot="chat-tool-trigger">
        <ChevronRight aria-hidden="true" className="chat-tool__chevron" size={14} />
        <span className="chat-tool__name">
          {triggerPrefix}
          {toolName}
        </span>
        <span className="chat-tool__state">{stateLabels[state]}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="chat-tool__details" data-slot="chat-tool-details">
        {argsText ? (
          <pre className="chat-tool__section" data-slot="chat-tool-args">
            {argsText}
          </pre>
        ) : null}
        {output !== undefined ? (
          <pre className="chat-tool__section" data-slot="chat-tool-result">
            {output}
          </pre>
        ) : null}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
