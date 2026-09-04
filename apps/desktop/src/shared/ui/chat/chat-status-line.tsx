import { ChatPixelLoader } from "@/shared/ui/chat/chat-pixel-loader";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import type { CotPhase } from "@/entities/session/cot-view";

/**
 * The last line of a live Chain of Thought: heartbeat, a shimmering status
 * word, and the running clock (ADR-0030 §3). It is the emotional layer — it
 * carries no information the step rows above it do not already state.
 */

export function formatLiveElapsed(ms: number) {
  const total = Math.max(0, ms) / 1000;

  if (total < 60) {
    return `${total.toFixed(1)}s`;
  }

  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

const THINKING_WORDS = [
  "Thinking",
  "Pondering",
  "Mulling",
  "Reasoning",
  "Exploring",
  "Connecting dots",
  "Weighing options",
  "Sketching a plan",
];

const ACTING_WORDS = [
  "Working",
  "Digging in",
  "Checking",
  "Poking around",
  "Running things",
  "Reading the room",
  "Following the trail",
];

const STATUS_WORD_INTERVAL_MS = 4000;

export type ChatStatusPhase = Extract<CotPhase, "thinking" | "acting">;

/**
 * One word per 4s interval. Derived from the elapsed time rather than kept in
 * state so it is stable across re-renders inside an interval and does not need
 * a timer of its own.
 */
export function statusWord(phase: ChatStatusPhase, elapsedMs: number) {
  const pool = phase === "thinking" ? THINKING_WORDS : ACTING_WORDS;
  const slot = Math.floor(Math.max(0, elapsedMs) / STATUS_WORD_INTERVAL_MS);
  const seed = (slot * 1103515245 + 12345) >>> 0;

  return pool[seed % pool.length];
}

export function ChatStatusLine({
  className = "",
  elapsedMs,
  phase,
}: {
  className?: string;
  /**
   * Absent while the Run has no clock anchor — a retry gap, most of all. The
   * line still beats and still names what is happening; only the number goes,
   * because "0.0s" would claim the run just started (ADR-0030 §6).
   */
  elapsedMs?: number;
  phase: ChatStatusPhase;
}) {
  return (
    <p
      className={`chat-status-line ${className}`.trim()}
      data-slot="chat-status-line"
      role="status"
    >
      <ChatPixelLoader />
      <TextShimmer className="chat-status-line__word">
        {statusWord(phase, elapsedMs ?? 0)}…
      </TextShimmer>
      {elapsedMs === undefined ? null : (
        <span className="chat-status-line__clock">{formatLiveElapsed(elapsedMs)}</span>
      )}
    </p>
  );
}
