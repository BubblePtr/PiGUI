import type { CSSProperties } from "react";

/**
 * Nine-cell pixel heartbeat. The only heartbeat in a Chain of Thought block,
 * carried by the trailing status line (ADR-0030 §3). Was private to
 * chat-chain-of-thought; promoted to a public atom so the status line and the
 * gallery share one implementation.
 */

/** ADR-0030 §8: 860ms, slower than the 650ms this loader ran at before. */
const DEFAULT_PERIOD_MS = 860;

// Cells light in a wave that runs left-to-right and outward from the middle
// row, so the grid reads as one drive rather than nine blinking dots.
const DRIVE_DELAYS = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;

  return (column + Math.abs(row - 1)) * 90;
});

export function ChatPixelLoader({
  className = "",
  periodMs = DEFAULT_PERIOD_MS,
}: {
  className?: string;
  periodMs?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={`chat-pixel-loader ${className}`.trim()}
      data-slot="chat-pixel-loader"
      // The period is a prop, not a stylesheet constant, so a caller can slow
      // or speed the beat without a rule that would shadow it.
      style={{ "--chat-pixel-period": `${periodMs}ms` } as CSSProperties}
    >
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
