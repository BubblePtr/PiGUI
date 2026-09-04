import { Collapsible } from "@base-ui-components/react/collapsible";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChatPixelLoader } from "@/shared/ui/chat/chat-pixel-loader";
import { ChatStatusLine, formatLiveElapsed } from "@/shared/ui/chat/chat-status-line";
import { ChevronRight } from "@/shared/ui/icons";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import type { CotPhase } from "@/entities/session/cot-view";

// Re-exported from its new home so the clock formatter keeps one import path.
export { formatLiveElapsed };

/** @deprecated Superseded by formatWorkedFor on the phase path; removed with the isStreaming path in #165. */
export function formatThoughtSummary(ms: number | undefined) {
  // An unmeasured duration claims no number — inventing one would pass a
  // guess off as a measurement, which nothing else in this app does.
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "Thought";
  }
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${seconds}s`;
}

/**
 * The settled header. "Worked", not "Thought": the number covers reasoning,
 * issuing calls and executing them — everything the user waited through before
 * the answer began (ADR-0030 §6).
 */
export function formatWorkedFor(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "Worked";
  }

  return `Worked for ${Math.max(1, Math.round(ms / 1000))}s`;
}

/** @deprecated Part of the isStreaming path; removed in #165. */
function LiveStatus({ elapsedMs }: { elapsedMs: number }) {
  return (
    <p className="chain-of-thought__live-label" role="status">
      <ChatPixelLoader />
      <TextShimmer>Thinking…</TextShimmer>
      <span className="chain-of-thought__elapsed">{formatLiveElapsed(elapsedMs)}</span>
    </p>
  );
}

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
    return 0;
  }
  return Math.max(0, now - startedAtMs);
}

/**
 * One Active Run's reasoning trace. Given a `phase` it is the ADR-0030 block:
 * a flat list of steps with a trailing status line while the run is in flight,
 * folding into a "Worked for Ns" header exactly once, when the run settles.
 *
 * The legacy `isStreaming` path (one-line viewport, header heartbeat) is still
 * here for AssistantRunTrace until #165 rewires it.
 */
export function ChatChainOfThought({
  children,
  className = "",
  defaultExpanded = false,
  elapsedMs,
  // Children are opaque to this component, so whether the run left anything to
  // disclose has to be told, not counted.
  hasSteps = true,
  /** @deprecated Pass `phase` instead; removed in #165. */
  isStreaming = false,
  phase,
  startedAtMs,
}: {
  children?: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  elapsedMs?: number;
  hasSteps?: boolean;
  isStreaming?: boolean;
  phase?: CotPhase;
  startedAtMs?: number;
}) {
  const [mountedAtMs] = useState(() => Date.now());
  const [userOpen, setUserOpen] = useState(defaultExpanded);
  const live = phase === "thinking" || phase === "acting";
  // On the phase path `startedAtMs` is the Run's only clock anchor: with no
  // anchor there is no number, because a clock started at mount would report
  // how long the page has been open (ADR-0030 §6). The legacy path still falls
  // back to mount time.
  const tickingMs = useTickingElapsed(
    phase === undefined ? (startedAtMs ?? mountedAtMs) : startedAtMs,
    (phase === undefined ? isStreaming : live) && elapsedMs === undefined,
  );
  const liveElapsedMs = elapsedMs ?? tickingMs;

  if (phase !== undefined) {
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
            <p
              className="chain-of-thought__label"
              data-slot="chain-of-thought-label"
            >
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
        {live ? <ChatStatusLine elapsedMs={liveElapsedMs} phase={phase} /> : null}
      </div>
    );
  }

  if (isStreaming) {
    return (
      <div
        className={`chain-of-thought ${className}`.trim()}
        data-slot="chain-of-thought"
        data-streaming="true"
      >
        <LiveStatus elapsedMs={liveElapsedMs} />
        {children}
      </div>
    );
  }

  return (
    <Collapsible.Root
      className={`chain-of-thought ${className}`.trim()}
      data-slot="chain-of-thought"
      data-streaming="false"
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

/**
 * Settled summary with nothing to expand behind it: a plain label in the
 * trigger's clothes, but no button role, no cursor, no empty panel. Use it
 * instead of Trigger+Content when the turn left no steps to disclose.
 */
function ChatChainOfThoughtLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`chain-of-thought__label ${className}`.trim()}
      data-slot="chain-of-thought-label"
    >
      {children}
    </p>
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

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** @deprecated The one-line viewport retires with the isStreaming path in #165; use ChatInlinePager. */
function ChatChainOfThoughtLive({
  children,
  className = "",
  pageKey,
}: {
  children: ReactNode;
  className?: string;
  pageKey?: string;
}) {
  const previousKeyRef = useRef(pageKey);
  const previousNodeRef = useRef(children);
  const [incoming, setIncoming] = useState(children);
  const [outgoing, setOutgoing] = useState<ReactNode>(null);

  useEffect(() => {
    if (pageKey === previousKeyRef.current) {
      previousNodeRef.current = children;
      setIncoming(children);
      return;
    }

    const previousNode = previousNodeRef.current;
    previousKeyRef.current = pageKey;
    previousNodeRef.current = children;
    setIncoming(children);
    // animation: none under reduced motion, so onAnimationEnd never fires.
    setOutgoing(prefersReducedMotion() ? null : previousNode);
  }, [pageKey, children]);

  return (
    <div
      className={`chain-of-thought__live ${className}`.trim()}
      data-slot="chain-of-thought-live"
    >
      <div className="chain-of-thought__flip">
        {outgoing ? (
          <div
            className="chain-of-thought__flip-page"
            data-motion="out"
            onAnimationEnd={() => setOutgoing(null)}
          >
            {outgoing}
          </div>
        ) : null}
        <div
          className="chain-of-thought__flip-page"
          data-motion={outgoing ? "in" : undefined}
        >
          {incoming}
        </div>
      </div>
    </div>
  );
}

ChatChainOfThought.Trigger = ChatChainOfThoughtTrigger;
ChatChainOfThought.Label = ChatChainOfThoughtLabel;
ChatChainOfThought.Content = ChatChainOfThoughtContent;
ChatChainOfThought.Steps = ChatChainOfThoughtSteps;
ChatChainOfThought.Step = ChatChainOfThoughtStep;
ChatChainOfThought.Live = ChatChainOfThoughtLive;
