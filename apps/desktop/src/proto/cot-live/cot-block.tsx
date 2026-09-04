// PROTO cot-live — the CoT block as one flat list of steps (Thought / Interim
// Output / tool step), the last of which may be live, under a header that
// collapses the list once the run settles. A trailing status line carries the
// heartbeat while live.

import { Collapsible } from "@base-ui-components/react/collapsible";
import { useState } from "react";
import { ChatThoughtMarkdown } from "@/shared/ui/chat/chat-thought-markdown";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import { formatLiveElapsed } from "@/shared/ui/chat/chat-chain-of-thought";
import { ProtoLive } from "./live";
import { ProtoToolStep } from "./tool-summary";
import type { CotStackItem, CotView } from "./model";

const DRIVE_DELAYS = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return (column + Math.abs(row - 1)) * 90;
});

function PixelLoader() {
  return (
    <span aria-hidden="true" className="chat-pixel-loader proto-cot__loader" data-slot="chat-pixel-loader">
      {DRIVE_DELAYS.map((delay, index) => (
        <span key={index} className="chat-pixel-loader__cell" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

// Status-line vocabulary, Claude Code style: whimsical, present tense.
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

export function statusWord(phase: "thinking" | "acting", elapsedMs: number) {
  const pool = phase === "thinking" ? THINKING_WORDS : ACTING_WORDS;
  const slot = Math.floor(elapsedMs / STATUS_WORD_INTERVAL_MS);
  const seed = (slot * 1103515245 + 12345) >>> 0;
  return pool[seed % pool.length];
}

/** "Worked for 12s": the wait until the answer started, tools included. */
export function formatWorkedFor(ms: number | undefined) {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "Worked";
  }
  return `Worked for ${Math.max(1, Math.round(ms / 1000))}s`;
}

function formatThoughtDuration(ms: number) {
  return ms < 1000 ? "briefly" : `${Math.max(1, Math.round(ms / 1000))}s`;
}

function Chevron() {
  return (
    <svg aria-hidden="true" className="proto-cot__chevron" viewBox="0 0 16 16" width="14" height="14">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A thinking part as a step row: "Thought 2s", expandable when there is text. */
function ThoughtStep({
  item,
  dwellMs,
}: {
  item: Extract<CotStackItem, { kind: "thinking" }>;
  dwellMs: number;
}) {
  const hasText = item.text.trim().length > 0;
  // "Thinking…" → "Thought 2s" is a page turn too, same pacing as the tools.
  const label = (
    <ProtoLive className="proto-step__pager" dwellMs={dwellMs} pageKey={item.live ? "live" : "settled"}>
      {item.live ? (
        <TextShimmer className="proto-step__label">Thinking…</TextShimmer>
      ) : (
        <span className="proto-step__label">
          Thought <span className="proto-step__meta">{formatThoughtDuration(item.durationMs)}</span>
        </span>
      )}
    </ProtoLive>
  );

  if (!hasText) {
    return <p className="proto-step proto-step--plain">{label}</p>;
  }

  return (
    <Collapsible.Root className="proto-step">
      <Collapsible.Trigger className="proto-step__trigger">
        {label}
        <Chevron />
      </Collapsible.Trigger>
      <Collapsible.Panel keepMounted className="proto-step__panel">
        <div className="chain-of-thought__step-body">
          <ChatThoughtMarkdown text={item.text} />
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export type RunLayout = "flat" | "collapsed";

export function ProtoCotBlock({
  view,
  runLayout,
  dwellMs,
}: {
  view: CotView;
  runLayout: RunLayout;
  dwellMs: number;
}) {
  const { phase, stack } = view;
  const [userOpen, setUserOpen] = useState(false);
  if (phase === "hidden") {
    return null;
  }

  const live = phase === "thinking" || phase === "acting";
  const settled = phase === "settled";
  // The header exists only once the run has settled; before that the list is
  // flat (or, in the collapsed layout, behind a "Thinking…" trigger). Showing
  // "Worked for" at answering made it flicker on the answering → acting
  // regression, so the fold happens exactly once, at run(end).
  const flatOpen = !settled && runLayout === "flat";
  const open = flatOpen ? true : userOpen;
  const headerText = settled ? formatWorkedFor(view.elapsedMs) : "Thinking…";
  const hasSteps = stack.length > 0;

  return (
    <div className="chain-of-thought proto-cot" data-phase={phase} data-slot="chain-of-thought">
      <Collapsible.Root open={open} onOpenChange={setUserOpen}>
        {flatOpen ? null : hasSteps ? (
          <Collapsible.Trigger className="chain-of-thought__trigger proto-cot__trigger">
            <span className="proto-cot__label">{headerText}</span>
            <Chevron />
          </Collapsible.Trigger>
        ) : (
          <p className="chain-of-thought__label proto-cot__trigger">
            <span className="proto-cot__label">{headerText}</span>
          </p>
        )}
        <Collapsible.Panel keepMounted className="chain-of-thought__content proto-cot__content">
          <ol className="chain-of-thought__steps proto-cot__steps">
            {stack.map((item) => (
              <li
                key={item.id}
                className="chain-of-thought__step proto-cot__step"
                data-kind={item.kind}
                data-live={"live" in item && item.live ? "true" : "false"}
              >
                {item.kind === "thinking" ? (
                  <ThoughtStep dwellMs={dwellMs} item={item} />
                ) : item.kind === "tools" ? (
                  <ProtoToolStep
                    activeToolCallId={item.activeToolCallId}
                    dwellMs={dwellMs}
                    live={item.live}
                    tools={item.tools}
                  />
                ) : (
                  <div className="proto-cot__interim">
                    <ChatThoughtMarkdown text={item.text} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Collapsible.Panel>
      </Collapsible.Root>
      {live ? (
        <p className="proto-cot__status" role="status">
          <PixelLoader />
          <TextShimmer className="proto-cot__status-word">{statusWord(phase, view.elapsedMs ?? 0)}…</TextShimmer>
          <span className="chain-of-thought__elapsed proto-cot__status-clock">
            {formatLiveElapsed(view.elapsedMs ?? 0)}
          </span>
        </p>
      ) : null}
    </div>
  );
}
