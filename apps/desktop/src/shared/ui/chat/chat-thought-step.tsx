import { Collapsible } from "@base-ui-components/react/collapsible";
import { ChatInlinePager } from "@/shared/ui/chat/chat-inline-pager";
import { ChatThoughtMarkdown } from "@/shared/ui/chat/chat-thought-markdown";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import { ChevronRight } from "@/shared/ui/icons";
import type { CotStep } from "@/entities/session/cot-view";

/**
 * A Thinking part as one step row: "Thought 2s" when settled, a shimmering
 * "Thinking…" while live, the body behind a disclosure when there is one
 * (ADR-0030 §3). Thinking content is the provider's to give or withhold, so an
 * empty body is a normal row, not a special state.
 */

export type ChatThoughtStepItem = Extract<CotStep, { kind: "thinking" }>;

function formatThoughtDuration(durationMs: number | undefined) {
  // An unmeasured duration claims no number, and anything under a second is
  // called brief rather than rounded up to a second that was never spent.
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }

  return durationMs < 1000 ? "briefly" : `${Math.round(durationMs / 1000)}s`;
}

export function ChatThoughtStep({
  className = "",
  dwellMs,
  step,
}: {
  className?: string;
  dwellMs?: number;
  step: ChatThoughtStepItem;
}) {
  const body = step.text.trim();
  const duration = formatThoughtDuration(step.durationMs);
  // "Thinking…" → "Thought 2s" turns the page at the same pace as the tool
  // names above it, so settling reads as one motion rather than a hard swap.
  const label = (
    <ChatInlinePager dwellMs={dwellMs} pageKey={step.live ? "live" : "settled"}>
      {step.live ? (
        <TextShimmer className="chat-step__label">Thinking…</TextShimmer>
      ) : (
        <span className="chat-step__label">
          {duration ? (
            <>
              Thought <span className="chat-step__meta">{duration}</span>
            </>
          ) : (
            "Thought"
          )}
        </span>
      )}
    </ChatInlinePager>
  );

  if (!body) {
    return (
      <p className={`chat-step chat-step--plain ${className}`.trim()} data-slot="chat-thought-step">
        {label}
      </p>
    );
  }

  return (
    <Collapsible.Root className={`chat-step ${className}`.trim()} data-slot="chat-thought-step">
      <Collapsible.Trigger className="chat-step__trigger">
        {label}
        <ChevronRight aria-hidden="true" className="chat-step__chevron" />
      </Collapsible.Trigger>
      <Collapsible.Panel keepMounted className="chat-step__panel">
        <div className="chat-step__body">
          <ChatThoughtMarkdown text={step.text} />
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
