import { Collapsible } from "@base-ui-components/react/collapsible";
import type { ReactNode } from "react";

/**
 * Collapsible reasoning trace. Content stays mounted while collapsed
 * (keepMounted) so step text remains findable; visibility is handled by the
 * hidden attribute Base UI applies to the panel.
 */
export function ChatChainOfThought({
  children,
  className = "",
  defaultExpanded = false,
  isStreaming = false,
}: {
  children: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  isStreaming?: boolean;
}) {
  return (
    <Collapsible.Root
      className={`chain-of-thought ${className}`.trim()}
      data-slot="chain-of-thought"
      data-streaming={String(Boolean(isStreaming))}
      defaultOpen={defaultExpanded}
    >
      {children}
    </Collapsible.Root>
  );
}

function ChatChainOfThoughtTrigger({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible.Trigger
      className={`chain-of-thought__trigger ${className}`.trim()}
      data-slot="chain-of-thought-trigger"
    >
      {children}
    </Collapsible.Trigger>
  );
}

function ChatChainOfThoughtContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible.Panel
      keepMounted
      className={`chain-of-thought__content ${className}`.trim()}
      data-slot="chain-of-thought-content"
    >
      {children}
    </Collapsible.Panel>
  );
}

function ChatChainOfThoughtSteps({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ol className={`chain-of-thought__steps ${className}`.trim()} data-slot="chain-of-thought-steps">
      {children}
    </ol>
  );
}

function ChatChainOfThoughtStep({
  label,
  children,
  className = "",
}: {
  // Omit for steps whose content is self-describing (e.g. tool-call groups).
  label?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={`chain-of-thought__step ${className}`.trim()}
      data-slot="chain-of-thought-step"
    >
      {label != null ? (
        <div className="chain-of-thought__step-label">{label}</div>
      ) : null}
      {children !== undefined && children !== null ? (
        <div className="chain-of-thought__step-body">{children}</div>
      ) : null}
    </li>
  );
}

ChatChainOfThought.Trigger = ChatChainOfThoughtTrigger;
ChatChainOfThought.Content = ChatChainOfThoughtContent;
ChatChainOfThought.Steps = ChatChainOfThoughtSteps;
ChatChainOfThought.Step = ChatChainOfThoughtStep;
