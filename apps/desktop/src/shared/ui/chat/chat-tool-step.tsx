import { Collapsible } from "@base-ui-components/react/collapsible";
import { ChatInlinePager } from "@/shared/ui/chat/chat-inline-pager";
import {
  ChatToolGroup,
  formatToolDuration,
  toolTargetFromArgs,
  type ChatToolItem,
} from "@/shared/ui/chat/chat-tool";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";
import { Cancel, Check, ChevronRight } from "@/shared/ui/icons";
import type { CotStep } from "@/entities/session/cot-view";

/**
 * A burst of Tool Calls as one step row (ADR-0030 §3). Live it names the call
 * currently streaming or executing and turns the page as Pi moves on; settled
 * it is one past-tense verb summary. A single call is just the one-element
 * burst — no second shape — and either way the row expands to the production
 * per-call rows.
 */

export type ChatToolStepItem = Extract<CotStep, { kind: "tools" }>;

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
  if (target.length <= TARGET_MAX) {
    return target;
  }

  if (target.includes("/") && !target.includes(" ")) {
    return `…${target.slice(-(TARGET_MAX - 1))}`;
  }

  return `${target.slice(0, TARGET_MAX - 1)}…`;
}

function pluralize(count: number, [one, many]: [string, string]) {
  if (count !== 1) {
    return `${count} ${many}`;
  }

  // "a tool" reads better than "1 tool" when we could not name the tool.
  return `${one === "tool" ? "a" : "1"} ${one}`;
}

/**
 * One call: verb plus what it acted on. Several: verbs in first-seen order
 * with counts, because "the last tool name and a number" reads a burst as one
 * call and says nothing about what the burst did.
 */
export function summarizeTools(tools: ChatToolItem[]) {
  if (tools.length === 1) {
    const [tool] = tools;
    const verb = VERBS[tool.toolName ?? ""] ?? FALLBACK;
    const target = toolTargetFromArgs(tool.argsText);

    if (target) {
      return `${verb.past} ${shortenTarget(target)}`;
    }

    return verb === FALLBACK
      ? `Used ${tool.toolName ?? "a tool"}`
      : `${verb.past} ${pluralize(1, verb.noun)}`;
  }

  const buckets = new Map<string, { verb: Verb; count: number }>();

  for (const tool of tools) {
    const verb = VERBS[tool.toolName ?? ""] ?? FALLBACK;
    const key = `${verb.past}:${verb.noun[1]}`;
    const bucket = buckets.get(key) ?? { verb, count: 0 };

    bucket.count += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map(({ verb, count }, index) => {
      const clause = `${verb.past} ${pluralize(count, verb.noun)}`;

      return index === 0 ? clause : clause.charAt(0).toLowerCase() + clause.slice(1);
    })
    .join(", ");
}

export function ChatToolStep({
  className = "",
  dwellMs,
  step,
}: {
  className?: string;
  dwellMs?: number;
  step: ChatToolStepItem;
}) {
  const { tools } = step;
  const failed = tools.filter((tool) => tool.state === "output-error").length;
  const totalMs = tools.reduce((sum, tool) => sum + (tool.durationMs ?? 0), 0);
  const active =
    tools.find((tool) => tool.toolCallId === step.activeToolCallId) ?? tools[tools.length - 1];
  const Glyph = failed > 0 ? Cancel : Check;
  // One pager for the row's whole life: call to call, and then to the summary,
  // all turn at the same pace, so finishing the burst is a page turn too.
  const pageKey = step.live ? `running:${active?.toolCallId ?? "none"}` : "settled";

  return (
    <Collapsible.Root
      className={`chat-step chat-tool-step ${className}`.trim()}
      data-slot="chat-tool-step"
    >
      <Collapsible.Trigger className="chat-step__trigger">
        <ChatInlinePager dwellMs={dwellMs} pageKey={pageKey}>
          {step.live ? (
            <TextShimmer className="chat-step__label">
              {active?.toolName ? `Running ${active.toolName}…` : "Running…"}
            </TextShimmer>
          ) : (
            <span className="chat-tool-step__page">
              <Glyph
                aria-hidden="true"
                className="chat-tool-step__glyph"
                data-state={failed > 0 ? "error" : "done"}
              />
              <span className="chat-step__label">{summarizeTools(tools)}</span>
              {failed > 0 ? (
                <span className="chat-step__meta chat-step__meta--error">
                  {failed === 1 ? "1 failed" : `${failed} failed`}
                </span>
              ) : null}
              {totalMs > 0 ? (
                <span className="chat-step__meta">{formatToolDuration(totalMs)}</span>
              ) : null}
            </span>
          )}
        </ChatInlinePager>
        <ChevronRight aria-hidden="true" className="chat-step__chevron" />
      </Collapsible.Trigger>
      <Collapsible.Panel keepMounted className="chat-step__panel">
        <ol className="chat-tool-step__list">
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
