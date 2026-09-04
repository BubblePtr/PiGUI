// PROTO cot-live — throwaway mock event script. Mirrors the Agent Runtime
// Event Model shape just enough to drive the CoT prototype. Deleted in Phase 7.

export type ProtoPartType = "thinking" | "text" | "tool_call";

export type ProtoEvent =
  | { t: number; type: "run"; phase: "start" | "end" }
  | { t: number; type: "message"; phase: "start" | "end"; messageId: string }
  | {
      t: number;
      type: "part";
      phase: "start" | "update" | "end";
      messageId: string;
      partId: string;
      partType: ProtoPartType;
      body: string;
      toolCallId?: string;
      toolName?: string;
    }
  | {
      t: number;
      type: "tool";
      phase: "start" | "end";
      toolCallId: string;
      name: string;
      result?: string;
      isError?: boolean;
    };

type Builder = {
  events: ProtoEvent[];
  message(id: string, from: number, to: number, fill: (m: MessageBuilder) => void): void;
  tool(
    toolCallId: string,
    name: string,
    from: number,
    to: number,
    result: string,
    isError?: boolean,
  ): void;
};

type MessageBuilder = {
  think(partId: string, text: string, from: number, to: number): void;
  text(partId: string, text: string, from: number, to: number): void;
  toolCall(
    partId: string,
    toolCallId: string,
    name: string,
    args: Record<string, unknown>,
    from: number,
    to: number,
  ): void;
};

function chunk(text: string, pieces: number): string[] {
  const size = Math.max(1, Math.ceil(text.length / pieces));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out;
}

function stream(
  events: ProtoEvent[],
  base: Omit<Extract<ProtoEvent, { type: "part" }>, "t" | "phase" | "body">,
  text: string,
  from: number,
  to: number,
) {
  // Roughly one chunk per 70ms of virtual time, never more than 3 chars/chunk
  // for thinking so the sentence pager gets exercised.
  const pieces = Math.max(1, Math.min(Math.ceil(text.length / 3), Math.floor((to - from) / 70)));
  const parts = chunk(text, pieces);
  events.push({ ...base, t: from, phase: "start", body: "" });
  parts.forEach((piece, index) => {
    events.push({
      ...base,
      t: from + ((to - from) * (index + 1)) / (parts.length + 1),
      phase: "update",
      body: piece,
    });
  });
  events.push({ ...base, t: to, phase: "end", body: text });
}

function builder(): Builder {
  const events: ProtoEvent[] = [];
  return {
    events,
    message(id, from, to, fill) {
      events.push({ t: from, type: "message", phase: "start", messageId: id });
      fill({
        think(partId, text, a, b) {
          stream(events, { type: "part", messageId: id, partId, partType: "thinking" }, text, a, b);
        },
        text(partId, text, a, b) {
          stream(events, { type: "part", messageId: id, partId, partType: "text" }, text, a, b);
        },
        toolCall(partId, toolCallId, name, args, a, b) {
          stream(
            events,
            { type: "part", messageId: id, partId, partType: "tool_call", toolCallId, toolName: name },
            JSON.stringify(args, null, 2),
            a,
            b,
          );
        },
      });
      events.push({ t: to, type: "message", phase: "end", messageId: id });
    },
    tool(toolCallId, name, from, to, result, isError = false) {
      events.push({ t: from, type: "tool", phase: "start", toolCallId, name });
      events.push({ t: to, type: "tool", phase: "end", toolCallId, name, result, isError });
    },
  };
}

const GREP_RESULT = `apps/desktop/src/pages/agent-workspace.tsx:425:            elapsedMs={modelElapsedMs ?? thoughtElapsedMs(timeline)}
apps/desktop/src/pages/agent-workspace.tsx:577:function runModelElapsedMs(model: SessionRuntimeModel | undefined, runId: string | undefined) {
apps/desktop/src/pages/agent-workspace.tsx:3353:                  modelElapsedMs={modelElapsedForMessage(message)}
apps/desktop/src/pages/agent-workspace.test.tsx:4097:  it("sums the run's model calls rather than the span between its trace steps", () => {`;

const READ_RESULT = `   577  function runModelElapsedMs(model, runId) {
   578    if (!model || !runId) return undefined;
   579    let total = 0;
   580    let measured = false;
   581    for (const message of model.messages) {
   582      if (message.runId !== runId || message.phase !== "final") continue;
   583      if (!message.startedAt) continue;
   584      total += Date.parse(message.updatedAt) - Date.parse(message.startedAt);
   585      measured = true;
   586    }
   587    return measured ? total : undefined;
   588  }`;

const TEST_FAIL = `$ bun vitest run apps/desktop/src/pages/agent-workspace.test.tsx -t "Thought for"

 RUN  v4.1.9 /Users/void/code/opensource/PiGUI

 ❯ apps/desktop/src/pages/agent-workspace.test.tsx (4 tests | 1 failed) 812ms
   ✓ renders "Thought for 5s" as a non-button label when the run left no steps
   ✓ renders "Thought for 11s" for a two-call run
   ✓ renders no chain of thought when the projection has no trace
   × sums the run's model calls rather than the span between its trace steps
     AssertionError: expected 'Thought for 9s' to be 'Thought for 12s'

     - Expected
     + Received

     - Thought for 12s
     + Thought for 9s

      ❯ agent-workspace.test.tsx:4112:52

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  12:41:07
   Duration  2.31s (transform 1.02s, setup 210ms, collect 1.41s, tests 812ms)`;

const TEST_PASS = `$ bun vitest run apps/desktop/src/pages/agent-workspace.test.tsx apps/desktop/src/shared/ui/chat

 RUN  v4.1.9 /Users/void/code/opensource/PiGUI

 ✓ apps/desktop/src/shared/ui/chat/chat-chain-of-thought.test.tsx (11 tests) 143ms
 ✓ apps/desktop/src/shared/ui/chat/chat-thought-markdown.test.tsx (7 tests) 22ms
 ✓ apps/desktop/src/shared/ui/chat/chat-tool.test.tsx (6 tests) 61ms
 ✓ apps/desktop/src/shared/ui/chat/text-shimmer.test.tsx (2 tests) 9ms
 ✓ apps/desktop/src/shared/ui/chat/chat-message.test.tsx (5 tests) 48ms
 ✓ apps/desktop/src/pages/agent-workspace.test.tsx (212 tests) 6.8s

 Test Files  6 passed (6)
      Tests  243 passed (243)
   Start at  12:41:31
   Duration  9.12s (transform 1.10s, setup 240ms, collect 2.01s, tests 7.08s)`;

const EDIT_OLD = `function runModelElapsedMs(model: SessionRuntimeModel | undefined, runId: string | undefined) {
  if (!model || !runId) {
    return undefined;
  }
  let total = 0;
  let measured = false;
  for (const message of model.messages) {
    if (message.runId !== runId || message.phase !== "final") {
      continue;
    }
    if (!message.startedAt) {
      continue;
    }
    total += Date.parse(message.updatedAt) - Date.parse(message.startedAt);
    measured = true;
  }
  return measured ? total : undefined;
}`;

const EDIT_NEW = `/**
 * Wall-clock the user waited before the answer started: from the run's first
 * Assistant Message to the first text part of the last one. Covers reasoning,
 * tool calls and tool execution; excludes the time spent writing the answer.
 */
function runThoughtElapsedMs(model: SessionRuntimeModel | undefined, runId: string | undefined) {
  if (!model || !runId) {
    return undefined;
  }
  const messages = model.messages.filter(
    (message) => message.runId === runId && !message.abandoned,
  );
  const anchor = messages[0]?.startedAt;
  const last = messages[messages.length - 1];
  if (!anchor || !last) {
    return undefined;
  }
  const answerStart =
    last.parts.find((part) => part.partType === "text")?.startedAt ?? last.updatedAt;
  return Math.max(0, Date.parse(answerStart) - Date.parse(anchor));
}`;

export function buildScript(): { events: ProtoEvent[]; durationMs: number } {
  const b = builder();
  b.events.push({ t: 0, type: "run", phase: "start" });

  // Turn 1: orient — thinking, interim text, two lookups.
  b.message("m1", 600, 5600, (m) => {
    m.think(
      "m1-th",
      "用户要把「Thought for Ns」的口径改成「到回答开始为止的等待时间」。现在的实现是 `runModelElapsedMs`，按每次模型调用的 start→end 求和。**这会把写回答的时间也算进去**，而且漏掉工具执行的时间。先确认它在哪被调用、测试怎么断言的。",
      700,
      3100,
    );
    m.text("m1-tx", "先看一下现有的计时实现和它的测试。", 3200, 3900);
    m.toolCall(
      "m1-tc1",
      "call-grep-1",
      "grep",
      { pattern: "runModelElapsedMs", path: "apps/desktop/src", glob: "*.ts?(x)" },
      4000,
      4700,
    );
    m.toolCall(
      "m1-tc2",
      "call-read-1",
      "read",
      { path: "apps/desktop/src/pages/agent-workspace.tsx", offset: 577, limit: 12 },
      4750,
      5500,
    );
  });
  b.tool("call-grep-1", "grep", 5650, 5980, GREP_RESULT);
  b.tool("call-read-1", "read", 6000, 6420, READ_RESULT);

  // Turn 2: a failed grep (bad regex), then the fixed one.
  b.message("m2", 6900, 10400, (m) => {
    m.think(
      "m2-th",
      "求和口径确认。新口径需要两个锚点：run 首条 Assistant Message 的 `startedAt`，和最后一条 Message 里第一个 `text` part 的开始时刻。\n第二个锚点现在没有——`SessionRuntimeMessagePart` 上没有时间戳。\n先搜一下 part 上有没有任何 `startedAt` 字段。",
      7000,
      9300,
    );
    m.toolCall(
      "m2-tc1",
      "call-grep-2",
      "grep",
      { pattern: "startedAt[", path: "apps/desktop/src/entities/session" },
      9400,
      10300,
    );
  });
  b.tool(
    "call-grep-2",
    "grep",
    10450,
    10620,
    "regex parse error:\n    startedAt[\n             ^\nerror: unclosed character class",
    true,
  );

  b.message("m3", 11000, 12600, (m) => {
    m.think("m3-th", "正则写错了，`[` 要转义。", 11050, 11700);
    m.toolCall(
      "m3-tc1",
      "call-grep-3",
      "grep",
      { pattern: "startedAt\\??:", path: "apps/desktop/src/entities/session" },
      11750,
      12500,
    );
  });
  b.tool(
    "call-grep-3",
    "grep",
    12650,
    12900,
    `apps/desktop/src/entities/session/session-runtime-model.ts:44:  startedAt?: string;
apps/desktop/src/entities/session/session-runtime-model.ts:62:  startedAt?: string;`,
  );

  // Turn 3: the edits — big streamed args, a second edit, a new test file.
  b.message("m4", 13400, 21200, (m) => {
    m.think(
      "m4-th",
      "只有 Message 和 Tool 有 `startedAt`，Part 没有。改三处：\n1. `SessionRuntimeMessagePart` 加 `startedAt`，在 `upsertPart` 收到 part(start) 时写入。\n2. 用 `runThoughtElapsedMs` 取代 `runModelElapsedMs`。\n3. 补一个多 Turn 的测试，断言口径。",
      13500,
      15600,
    );
    m.text("m4-tx", "找到了。Part 上缺时间戳，我加上，然后换掉求和函数。", 15700, 16600);
    m.toolCall(
      "m4-tc1",
      "call-edit-1",
      "edit",
      {
        path: "apps/desktop/src/entities/session/session-runtime-model.ts",
        old_string: "export type SessionRuntimeMessagePart = {\n  partId: string;\n  partType: AgentMessagePartType;\n  body: string;\n  done: boolean;",
        new_string:
          "export type SessionRuntimeMessagePart = {\n  partId: string;\n  partType: AgentMessagePartType;\n  body: string;\n  done: boolean;\n  // Stamped on part(start); absent on legacy bridges that mint no part boundaries.\n  startedAt?: string;",
      },
      16700,
      17900,
    );
    m.toolCall(
      "m4-tc2",
      "call-edit-2",
      "edit",
      { path: "apps/desktop/src/pages/agent-workspace.tsx", old_string: EDIT_OLD, new_string: EDIT_NEW },
      17950,
      20200,
    );
    m.toolCall(
      "m4-tc3",
      "call-write-1",
      "write",
      {
        path: "apps/desktop/src/pages/agent-workspace.thought-elapsed.test.tsx",
        content:
          'import { describe, expect, it } from "vitest";\nimport { runThoughtElapsedMs } from "./agent-workspace";\nimport { multiTurnRuntimeModel } from "@/fixtures/runtime-model";\n\ndescribe("runThoughtElapsedMs", () => {\n  it("measures from the first message to the answer start, across tool time", () => {\n    expect(runThoughtElapsedMs(multiTurnRuntimeModel, "run-1")).toBe(12_000);\n  });\n});\n',
      },
      20250,
      21100,
    );
  });
  b.tool("call-edit-1", "edit", 21300, 21560, "Edited apps/desktop/src/entities/session/session-runtime-model.ts (+2 lines)");
  b.tool("call-edit-2", "edit", 21600, 21900, "Edited apps/desktop/src/pages/agent-workspace.tsx (+21 -17 lines)");
  b.tool(
    "call-write-1",
    "write",
    21950,
    22150,
    "Wrote apps/desktop/src/pages/agent-workspace.thought-elapsed.test.tsx (11 lines)",
  );

  // Turn 4: run the tests — long-running, one failure.
  b.message("m5", 22700, 24600, (m) => {
    m.think("m5-th", "跑一下相关测试，先只跑「Thought for」相关的用例。", 22750, 23700);
    m.toolCall(
      "m5-tc1",
      "call-bash-1",
      "bash",
      { command: 'bun vitest run apps/desktop/src/pages/agent-workspace.test.tsx -t "Thought for"' },
      23750,
      24500,
    );
  });
  b.tool("call-bash-1", "bash", 24700, 30900, TEST_FAIL, true);

  // Turn 5: fix the assertion, rerun everything, pass.
  b.message("m6", 31400, 35300, (m) => {
    m.think(
      "m6-th",
      "预期的 12s 是旧口径（两次调用 7s + 5s 求和）。新口径下这条 fixture 的回答在 9s 开始，所以 9s 才对。**测试断言要跟着口径改**，不是实现错了。",
      31500,
      33800,
    );
    m.toolCall(
      "m6-tc1",
      "call-edit-3",
      "edit",
      {
        path: "apps/desktop/src/pages/agent-workspace.test.tsx",
        old_string: 'it("sums the run\'s model calls rather than the span between its trace steps"',
        new_string: 'it("measures the wait until the answer starts, not the sum of model calls"',
      },
      33900,
      34700,
    );
    m.toolCall(
      "m6-tc2",
      "call-bash-2",
      "bash",
      { command: "bun vitest run apps/desktop/src/pages/agent-workspace.test.tsx apps/desktop/src/shared/ui/chat" },
      34750,
      35250,
    );
  });
  b.tool("call-edit-3", "edit", 35400, 35600, "Edited apps/desktop/src/pages/agent-workspace.test.tsx (+3 -3 lines)");
  b.tool("call-bash-2", "bash", 35650, 44800, TEST_PASS);

  // Turn 6: the final answer.
  b.message("m7", 45300, 53000, (m) => {
    m.think("m7-th", "全绿。总结改动和口径。", 45350, 46300);
    m.text(
      "m7-tx",
      `已把「Thought for Ns」改成**到回答开始为止的等待时间**。

改了三处：

- \`SessionRuntimeMessagePart\` 新增 \`startedAt\`，在 part(start) 时写入。
- \`runModelElapsedMs\` 替换为 \`runThoughtElapsedMs\`：锚点是 run 首条 Assistant Message 的开始，终点是最后一条 Message 里第一个 text part 的开始。
- 更新了原来断言求和口径的那条测试，并新增一条多 Turn 用例。

口径变化的影响：

| 场景 | 旧口径 | 新口径 |
| --- | --- | --- |
| 单 Turn，思考 3s，写回答 20s | 23s | 3s |
| 两 Turn，含 6s 工具执行 | 12s | 18s |

\`\`\`bash
bun vitest run apps/desktop/src/pages/agent-workspace.test.tsx apps/desktop/src/shared/ui/chat
\`\`\`

243 个用例通过。legacy \`runtimeEvents\` 管道没有 Message 边界，这条路上的 CoT 仍然不显示时长。`,
      46400,
      52800,
    );
  });
  b.events.push({ t: 53200, type: "run", phase: "end" });

  b.events.sort((a, c) => a.t - c.t);
  return { events: b.events, durationMs: 54000 };
}
