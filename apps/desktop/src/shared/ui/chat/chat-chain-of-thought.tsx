import { Collapsible } from "@base-ui-components/react/collapsible";
import { useEffect, useState, type ReactNode } from "react";
import { ChatStatusLine } from "@/shared/ui/chat/chat-status-line";
import { ChevronRight } from "@/shared/ui/icons";
import type { CotPhase } from "@/entities/session/cot-view";

/**
 * The settled header. "Worked", not "Thought": the number covers reasoning,
 * issuing calls and executing them — everything the user waited through before
 * the answer began (ADR-0030 §6).
 */
export function formatWorkedFor(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "Worked";
  }

  // Round to whole seconds first, then split: a 59.6s wait should read as
  // 1m 0s, not 60s, and a 59m 59.6s wait as 1h 0m 0s, not 60m 0s.
  const totalSeconds = Math.max(1, Math.round(ms / 1000));

  if (totalSeconds < 60) {
    return `Worked for ${totalSeconds}s`;
  }

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `Worked for ${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `Worked for ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * The Run's clock, walked here at 100ms so the page does not re-derive its
 * whole view that often. With no anchor there is no number: a clock started at
 * mount would report how long the page has been open (ADR-0030 §6).
 */
function useTickingElapsed(startedAtMs: number | undefined, enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (startedAtMs === undefined) {
    return undefined;
  }
  return Math.max(0, now - startedAtMs);
}

/**
 * One Active Run's reasoning trace: a flat list of steps with a trailing
 * status line while the run is in flight, folding into a "Worked for Ns"
 * header exactly once, when the run settles (ADR-0030 §3/§5).
 */
export function ChatChainOfThought({
  children,
  className = "",
  defaultExpanded = false,
  elapsedMs,
  // Children are opaque to this component, so whether the run left anything to
  // disclose has to be told, not counted.
  hasSteps = true,
  phase,
  startedAtMs,
}: {
  children?: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  elapsedMs?: number;
  hasSteps?: boolean;
  phase: CotPhase;
  startedAtMs?: number;
}) {
  const [userOpen, setUserOpen] = useState(defaultExpanded);
  const live = phase === "thinking" || phase === "acting";
  const tickingMs = useTickingElapsed(startedAtMs, live && elapsedMs === undefined);

  if (phase === "hidden") {
    return null;
  }

  const settled = phase === "settled";
  const header = formatWorkedFor(elapsedMs);

  return (
    <div
      className={`chain-of-thought ${className}`.trim()}
      data-phase={phase}
      data-slot="chain-of-thought"
    >
      <Collapsible.Root
        // Flat until the run settles; the fold happens once, at run(end).
        open={settled ? userOpen : true}
        onOpenChange={setUserOpen}
      >
        {!settled ? null : hasSteps ? (
          <Collapsible.Trigger
            className="chain-of-thought__trigger"
            data-slot="chain-of-thought-trigger"
          >
            {header}
            <ChevronRight aria-hidden="true" className="chat-step__chevron" />
          </Collapsible.Trigger>
        ) : (
          <p className="chain-of-thought__label" data-slot="chain-of-thought-label">
            {header}
          </p>
        )}
        <Collapsible.Panel
          keepMounted
          className="chain-of-thought__content"
          data-slot="chain-of-thought-content"
        >
          {children}
        </Collapsible.Panel>
      </Collapsible.Root>
      {live ? (
        <ChatStatusLine elapsedMs={elapsedMs ?? tickingMs} phase={phase} />
      ) : null}
    </div>
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
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <li
      className={`chain-of-thought__step ${className}`.trim()}
      data-slot="chain-of-thought-step"
    >
      {children}
    </li>
  );
}

ChatChainOfThought.Steps = ChatChainOfThoughtSteps;
ChatChainOfThought.Step = ChatChainOfThoughtStep;
