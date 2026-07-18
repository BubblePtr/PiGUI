import { describe, expect, it, vi } from "vitest";
import {
  measureIdleAgentSessionMemory,
  selectIdleMemorySessionSamples,
  summarizeIdleAgentSessionMemory,
  type IdleMemorySessionInfo,
} from "./session-memory-measurement";

const mib = 1024 * 1024;

function session(path: string, modified: string): IdleMemorySessionInfo {
  return {
    id: path,
    path,
    cwd: "/tmp/project",
    modified: new Date(modified),
    messageCount: 1,
  };
}

describe("session memory measurement", () => {
  it("selects the newest non-empty historical sessions up to the requested sample size", () => {
    const sessions = [
      session("/tmp/old.jsonl", "2026-07-01T00:00:00.000Z"),
      { ...session("/tmp/empty.jsonl", "2026-07-03T00:00:00.000Z"), messageCount: 0 },
      session("/tmp/new.jsonl", "2026-07-03T00:00:00.000Z"),
      session("/tmp/mid.jsonl", "2026-07-02T00:00:00.000Z"),
    ];

    expect(selectIdleMemorySessionSamples(sessions, { sampleSize: 2 })).toEqual([
      sessions[2],
      sessions[3],
    ]);
  });

  it("summarizes cumulative RSS growth and flags oversized per-session deltas", () => {
    const summary = summarizeIdleAgentSessionMemory({
      baselineRssBytes: 100 * mib,
      openedSessions: [
        { path: "/tmp/a.jsonl", rssBytes: 108 * mib },
        { path: "/tmp/b.jsonl", rssBytes: 132 * mib },
        { path: "/tmp/c.jsonl", rssBytes: 144 * mib },
      ],
      thresholdBytes: 20 * mib,
    });

    expect(summary.openedCount).toBe(3);
    expect(summary.totalDeltaBytes).toBe(44 * mib);
    expect(summary.averageDeltaBytes).toBeCloseTo((44 * mib) / 3);
    expect(summary.maxStepDeltaBytes).toBe(24 * mib);
    expect(summary.shouldAdvanceEviction).toBe(true);
  });

  it("opens selected sessions, keeps them alive through measurement, then disposes them", async () => {
    const opened: string[] = [];
    const disposed: string[] = [];
    const rssValues = [100 * mib, 106 * mib, 111 * mib];
    const readRssBytes = vi.fn(() => rssValues.shift() ?? 111 * mib);

    const result = await measureIdleAgentSessionMemory({
      sampleSize: 2,
      listSessions: async () => [
        session("/tmp/a.jsonl", "2026-07-03T00:00:00.000Z"),
        session("/tmp/b.jsonl", "2026-07-02T00:00:00.000Z"),
      ],
      openAgentSession: async (info) => {
        opened.push(info.path);

        return {
          dispose() {
            disposed.push(info.path);
          },
        };
      },
      readRssBytes,
      settle: async () => {},
      thresholdBytes: 20 * mib,
    });

    expect(opened).toEqual(["/tmp/a.jsonl", "/tmp/b.jsonl"]);
    expect(disposed).toEqual(["/tmp/a.jsonl", "/tmp/b.jsonl"]);
    expect(readRssBytes).toHaveBeenCalledTimes(3);
    expect(result.summary.openedCount).toBe(2);
    expect(result.summary.shouldAdvanceEviction).toBe(false);
  });
});
