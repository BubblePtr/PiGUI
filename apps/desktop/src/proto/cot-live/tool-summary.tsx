// PROTO cot-live — a tool step. Live: one row naming the call currently
// streaming or executing ("Running grep…"), flipping between calls. Settled:
// one verb summary — "Read agent-workspace.tsx" for a single call, "Ran 2
// commands, edited 3 files" for a burst. Either way it expands to the
// per-call production rows, so one call is just the one-element burst.

import { Collapsible } from "@base-ui-components/react/collapsible";
import {
  ChatToolGroup,
  formatToolDuration,
  toolTargetFromArgs,
  type ChatToolItem,
} from "@/shared/ui/chat/chat-tool";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import { ProtoLive } from "./live";

type Verb = { past: string; noun: [string, string] };

const VERBS: Record<string, Verb> = {
  bash: { past: "Ran", noun: ["command", "commands"] },
  read: { past: "Read", noun: ["file", "files"] },
  edit: { past: "Edited", noun: ["file", "files"] },
  write: { past: "Wrote", noun: ["file", "files"] },
  grep: { past: "Searched", noun: ["pattern", "patterns"] },
  find: { past: "Searched", noun: ["path", "paths"] },
  ls: { past: "Listed", noun: ["directory", "directories"] },
};

const FALLBACK: Verb = { past: "Used", noun: ["tool", "tools"] };

const TARGET_MAX = 72;

/** Paths keep their tail (the file name is the news); commands keep their head. */
function shortenTarget(target: string) {
  if (target.length <= TARGET_MAX) return target;
  if (target.includes("/") && !target.includes(" ")) {
    return `…${target.slice(-(TARGET_MAX - 1))}`;
  }
  return `${target.slice(0, TARGET_MAX - 1)}…`;
}

function pluralize(count: number, [one, many]: [string, string]) {
  return `${count === 1 ? (one === "tool" ? "a" : "1") : count} ${count === 1 ? one : many}`;
}

/**
 * Settled summary. One call: verb + what it acted on ("Read agent-workspace.tsx",
 * "Ran bun vitest run …"). Several: verbs in first-seen order with counts.
 */
export function summarizeTools(tools: ChatToolItem[]) {
  if (tools.length === 1) {
    const [tool] = tools;
    const verb = VERBS[tool.toolName ?? ""] ?? FALLBACK;
    const target = toolTargetFromArgs(tool.argsText);
    if (target) {
      return `${verb.past} ${shortenTarget(target)}`;
    }
    return verb === FALLBACK ? `Used ${tool.toolName ?? "a tool"}` : `${verb.past} ${pluralize(1, verb.noun)}`;
  }
  const buckets = new Map<string, { verb: Verb; count: number }>();
  for (const tool of tools) {
    const verb = VERBS[tool.toolName ?? ""] ?? FALLBACK;
    const key = `${verb.past}:${verb.noun[1]}`;
    const bucket = buckets.get(key) ?? { verb, count: 0 };
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  const clauses = [...buckets.values()].map(({ verb, count }, index) => {
    const text = `${verb.past} ${pluralize(count, verb.noun)}`;
    return index === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
  });
  return clauses.join(", ");
}

function StatusGlyph({ tools }: { tools: ChatToolItem[] }) {
  const errors = tools.some((tool) => tool.state === "output-error");
  return (
    <span aria-hidden="true" className="proto-tools__glyph" data-state={errors ? "error" : "done"}>
      {errors ? (
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function Chevron() {
  return (
    <svg aria-hidden="true" className="proto-tools__chevron" viewBox="0 0 16 16" width="14" height="14">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProtoToolStep({
  tools,
  live,
  activeToolCallId,
  dwellMs,
}: {
  tools: ChatToolItem[];
  live: boolean;
  activeToolCallId?: string;
  dwellMs: number;
}) {
  const errors = tools.filter((tool) => tool.state === "output-error").length;
  const total = tools.reduce((sum, tool) => sum + (tool.durationMs ?? 0), 0);
  const active = tools.find((tool) => tool.toolCallId === activeToolCallId) ?? tools[tools.length - 1];

  // One pager for the whole life of the row: "Running a…" → "Running b…" →
  // the past-tense summary all flip with the same pacing, so finishing the
  // last call is a page turn, not a hard swap between two subtrees.
  const pageKey = live ? `running:${active?.toolCallId ?? "none"}` : "settled";

  return (
    <Collapsible.Root className="proto-tools" data-live={live ? "true" : "false"}>
      <Collapsible.Trigger className="proto-tools__trigger">
        <ProtoLive className="proto-tools__pager" dwellMs={dwellMs} pageKey={pageKey}>
          {live ? (
            <TextShimmer className="proto-tools__label">Running {active?.toolName ?? "tool"}…</TextShimmer>
          ) : (
            <span className="proto-tools__page">
              <StatusGlyph tools={tools} />
              <span className="proto-tools__label">{summarizeTools(tools)}</span>
              {errors ? (
                <span className="proto-tools__meta proto-tools__meta--error">
                  {errors === 1 ? "1 failed" : `${errors} failed`}
                </span>
              ) : null}
              {total > 0 ? <span className="proto-tools__meta">{formatToolDuration(total)}</span> : null}
            </span>
          )}
        </ProtoLive>
        <Chevron />
      </Collapsible.Trigger>
      <Collapsible.Panel keepMounted className="proto-tools__panel">
        <ol className="proto-tools__list">
          {tools.map((tool, index) => (
            <li key={tool.toolCallId ?? index}>
              <ChatToolGroup tools={[tool]} />
            </li>
          ))}
        </ol>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
