import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSessionIndex,
  buildSessionIndexWithCache,
  classifyTitle,
  createSessionIndexCache,
  parseSession,
} from "./backend/sessions";

function fixtureAgentDir() {
  return join(process.cwd(), "fixtures/pi-agent");
}

async function tempAgentDir() {
  return mkdtemp(join(tmpdir(), "pig-agent-"));
}

async function writeSession(agentDir: string, project: string, file: string, jsonl: string) {
  const sessionDir = join(agentDir, "sessions", project);

  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, file), jsonl);
}

function expectCost(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-12);
}

describe("backend session parser", () => {
  it("builds the session index newest first with projects and title chips", async () => {
    const sessions = await buildSessionIndex(fixtureAgentDir());

    expect(sessions).toHaveLength(3);
    expect(sessions.map((session) => session.id)).toEqual([
      "newest-session",
      "middle-session",
      "oldest-session",
    ]);
    expect(sessions.map((session) => session.project)).toEqual(["gamma", "beta", "alpha"]);
    expect(sessions.map((session) => session.title)).toEqual([
      { kind: "command", name: "review", args: "" },
      { kind: "text", sentence: "Show project status." },
      { kind: "text", sentence: "Show project status." },
    ]);
  });

  it("reconstructs detail turn order and merges tool results into assistant turns", async () => {
    const jsonl = await readFile(
      join(
        fixtureAgentDir(),
        "sessions/project-beta/2026-01-03T12-00-00-000Z_middle-session.jsonl",
      ),
      "utf8",
    );

    const detail = parseSession(jsonl);

    expect(detail.id).toBe("middle-session");
    expect(detail.project).toBe("beta");
    expect(detail.turns.map((turn) => [turn.kind, turn.role ?? null])).toEqual([
      ["annotation", null],
      ["annotation", null],
      ["message", "user"],
      ["message", "assistant"],
    ]);
    expect(detail.turns[3].parts.map((part) => part.partType)).toEqual([
      "thinking",
      "text",
      "toolCall",
      "image",
      "toolResult",
    ]);
    expect(detail.turns[3].parts[0].text).toBe("Need to inspect the tree.");
    expect(detail.turns[3].parts[2].name).toBe("list_files");
    expect(detail.turns[3].parts[4]).toMatchObject({
      partType: "toolResult",
      text: "src/main.tsx\nsrc-tauri/src/lib.rs",
    });
  });

  it("aggregates cost and tokens across model changes", () => {
    const detail = parseSession(`{"type":"session","id":"multi-model-session","timestamp":"2026-01-07T10:00:00.000Z","cwd":"/Users/example/code/delta","model":"gpt-5-mini"}
{"type":"message","role":"user","timestamp":"2026-01-07T10:00:01.000Z","content":[{"type":"text","text":"Compare these files."}]}
{"type":"message","role":"assistant","timestamp":"2026-01-07T10:00:02.000Z","usage":{"inputTokens":100,"outputTokens":50,"cost":{"inputUsd":0.01,"outputUsd":0.02,"totalUsd":0.03}},"content":[{"type":"text","text":"I will inspect both files."}]}
{"type":"model_change","timestamp":"2026-01-07T10:00:03.000Z","from":"gpt-5-mini","to":"gpt-5-codex"}
{"type":"message","role":"assistant","timestamp":"2026-01-07T10:00:04.000Z","usage":{"input_tokens":150,"output_tokens":50,"cache_read_tokens":20,"total_tokens":220},"cost":{"input_usd":0.04,"output_usd":0.08,"cache_read_usd":0.01,"total_usd":0.13},"content":[{"type":"text","text":"The second file changed the API contract."}]}`);

    expect(detail.totalTokens).toBe(370);
    expectCost(detail.totalCostUsd, 0.16);
    expect(detail.primaryModel).toBe("gpt-5-codex");
    expect(detail.turnCount).toBe(3);
    expect(detail.durationSeconds).toBe(4);
    expect(detail.turns.filter((turn) => turn.role === "assistant").map((turn) => ({
      model: turn.model,
      totalTokens: turn.usage?.totalTokens,
      totalUsd: turn.cost?.totalUsd,
    }))).toEqual([
      { model: "gpt-5-mini", totalTokens: 150, totalUsd: 0.03 },
      { model: "gpt-5-codex", totalTokens: 220, totalUsd: 0.13 },
    ]);
  });

  it("exposes model breakdown, tool counts, and skill counts in summaries", async () => {
    const agentDir = await tempAgentDir();

    await writeSession(
      agentDir,
      "metrics",
      "2026-01-09T10-00-00-000Z_metrics-session.jsonl",
      `{"type":"session","id":"metrics-session","timestamp":"2026-01-09T10:00:00.000Z","cwd":"/Users/example/code/metrics","model":"gpt-5-mini"}
{"type":"message","role":"user","timestamp":"2026-01-09T10:00:01.000Z","content":[{"type":"text","text":"Use <skill name=\\"kami\\"> and inspect files."}]}
{"type":"message","role":"assistant","timestamp":"2026-01-09T10:00:02.000Z","usage":{"inputTokens":100,"outputTokens":50,"cost":{"totalUsd":0.03}},"content":[{"type":"toolCall","name":"list_files"},{"type":"toolCall","name":"read_file"},{"type":"text","text":"Switching to <skill-review>."}]}
{"type":"model_change","timestamp":"2026-01-09T10:00:03.000Z","to":"gpt-5-codex"}
{"type":"message","role":"assistant","timestamp":"2026-01-09T10:00:04.000Z","usage":{"totalTokens":220},"cost":{"totalUsd":0.13},"content":[{"type":"toolCall","name":"list_files"}]}`,
    );

    const sessions = await buildSessionIndex(agentDir);

    expect(sessions[0]).toMatchObject({
      id: "metrics-session",
      totalTokens: 370,
      totalCostUsd: 0.16,
      primaryModel: "gpt-5-codex",
      modelBreakdown: [
        { model: "gpt-5-codex", costUsd: 0.13, tokens: 220 },
        { model: "gpt-5-mini", costUsd: 0.03, tokens: 150 },
      ],
      toolCounts: [
        { name: "list_files", count: 2 },
        { name: "read_file", count: 1 },
      ],
      skillCounts: [
        { name: "kami", count: 1 },
        { name: "review", count: 1 },
      ],
    });
  });

  it("reuses cached summaries when file mtimes are unchanged", async () => {
    const cache = createSessionIndexCache();

    const first = await buildSessionIndexWithCache(fixtureAgentDir(), cache);
    const second = await buildSessionIndexWithCache(fixtureAgentDir(), cache);

    expect(second).toEqual(first);
    expect(cache.misses).toBe(3);
    expect(cache.hits).toBe(3);
  });

  it("parses nested message records used by current Pi sessions", () => {
    const detail = parseSession(`{"type":"session","id":"test-nested","timestamp":"2026-06-23T10:00:00.000Z","cwd":"/Users/test/proj"}
{"type":"message","id":"msg1","parentId":null,"timestamp":"2026-06-23T10:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"Hello world"}]}}
{"type":"message","id":"msg2","parentId":"msg1","timestamp":"2026-06-23T10:00:02.000Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Let me think."},{"type":"text","text":"Hi there!"},{"type":"toolCall","name":"list_files","arguments":{"path":"."}}],"model":"gpt-5","usage":{"input":100,"output":50,"totalTokens":150},"cost":{"input":0.01,"output":0.02,"total":0.03}}}`);

    expect(detail.turns).toHaveLength(2);
    expect(detail.turns[0].parts[0]).toMatchObject({ partType: "text", text: "Hello world" });
    expect(detail.turns[1].parts.map((part) => part.partType)).toEqual([
      "thinking",
      "text",
      "toolCall",
    ]);
    expect(detail.turns[1].parts[0].text).toBe("Let me think.");
    expect(detail.turns[1].parts[2].name).toBe("list_files");
    expect(detail.turns[1].model).toBe("gpt-5");
    expect(detail.turns[1].usage?.totalTokens).toBe(150);
    expectCost(detail.totalCostUsd, 0.03);
  });

  it("classifies command, skill, natural-language, trivial, and unicode titles", () => {
    expect(classifyTitle("/grilling sharpen this plan")).toEqual({
      kind: "command",
      name: "grilling",
      args: "sharpen this plan",
    });
    expect(classifyTitle("<skill name=\"kami\">make this one-pager</skill>")).toEqual({
      kind: "skill",
      name: "kami",
    });
    expect(classifyTitle("Show me the latest task status. Then explain blockers.")).toEqual({
      kind: "text",
      sentence: "Show me the latest task status.",
    });
    expect(classifyTitle("echo test")).toEqual({ kind: "raw", text: "echo test" });
    expect(
      classifyTitle("🙂".repeat(97)),
    ).toEqual({
      kind: "text",
      sentence: `${"🙂".repeat(96)}...`,
    });
  });
});
