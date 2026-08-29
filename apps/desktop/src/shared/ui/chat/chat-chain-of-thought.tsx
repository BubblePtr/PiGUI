import { Collapsible } from "@base-ui-components/react/collapsible";
import { useEffect, useState, type ReactNode } from "react";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";

export function formatLiveElapsed(ms: number) {
  const total = Math.max(0, ms) / 1000;
  if (total < 60) {
    return `${total.toFixed(1)}s`;
  }
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

export function formatThoughtSummary(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "Thought for 3s";
  }
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${seconds}s`;
}

const DRIVE_DELAYS = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return (column + Math.abs(row - 1)) * 90;
});

function ChatPixelLoader() {
  return (
    <span aria-hidden="true" className="chat-pixel-loader" data-slot="chat-pixel-loader">
      {DRIVE_DELAYS.map((delay, index) => (
        <span
          key={index}
          className="chat-pixel-loader__cell"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

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
 * Collapsible reasoning trace when settled. Streaming renders a live status
 * plus a one-page viewport — the full step list stays closed until the turn ends.
 */
export function ChatChainOfThought({
  children,
  className = "",
  defaultExpanded = false,
  elapsedMs,
  isStreaming = false,
  startedAtMs,
}: {
  children: ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  elapsedMs?: number;
  isStreaming?: boolean;
  startedAtMs?: number;
}) {
  const [mountedAtMs] = useState(() => Date.now());
  // Live ticks from mount (or an explicit start). Never treat historical
  // event timestamps as startedAtMs — replay fixtures sit in the past.
  const tickingMs = useTickingElapsed(
    startedAtMs ?? mountedAtMs,
    isStreaming && elapsedMs === undefined,
  );
  const liveElapsedMs = elapsedMs ?? tickingMs;

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

function ChatChainOfThoughtLive({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`chain-of-thought__live ${className}`.trim()}
      data-slot="chain-of-thought-live"
    >
      {children}
    </div>
  );
}

ChatChainOfThought.Trigger = ChatChainOfThoughtTrigger;
ChatChainOfThought.Content = ChatChainOfThoughtContent;
ChatChainOfThought.Steps = ChatChainOfThoughtSteps;
ChatChainOfThought.Step = ChatChainOfThoughtStep;
ChatChainOfThought.Live = ChatChainOfThoughtLive;
