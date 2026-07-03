import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RuntimeGatewayEventEnvelope } from "@pigui/core";
import {
  createFileSessionEventJournal,
  createInMemorySessionEventJournal,
} from "./session-event-journal";

function envelope(overrides: Partial<RuntimeGatewayEventEnvelope>): RuntimeGatewayEventEnvelope {
  return {
    id: "evt-1",
    seq: 1,
    sessionId: "app-session-1",
    piSessionId: "pi-session-1",
    type: "message",
    ts: "2026-07-03T10:00:00.000Z",
    payload: { type: "message", phase: "end", origin: "sdk" },
    ...overrides,
  };
}

const tempDirs: string[] = [];

async function tempDataDir() {
  const dir = await mkdtemp(join(tmpdir(), "pigui-journal-"));

  tempDirs.push(dir);

  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("in-memory session event journal", () => {
  it("returns appended envelopes per session in append order", async () => {
    const journal = createInMemorySessionEventJournal();

    journal.append(envelope({ id: "evt-1", seq: 1 }));
    journal.append(envelope({ id: "evt-2", seq: 2, piSessionId: "pi-session-2" }));
    journal.append(envelope({ id: "evt-3", seq: 3 }));

    expect(await journal.read("pi-session-1")).toEqual([
      envelope({ id: "evt-1", seq: 1 }),
      envelope({ id: "evt-3", seq: 3 }),
    ]);
    expect(await journal.read("pi-session-2")).toEqual([
      envelope({ id: "evt-2", seq: 2, piSessionId: "pi-session-2" }),
    ]);
    expect(await journal.read("pi-session-unknown")).toEqual([]);
  });
});

describe("file session event journal", () => {
  it("appends envelopes as JSON lines under <dataDir>/sessions", async () => {
    const dataDir = await tempDataDir();
    const journal = createFileSessionEventJournal({ dataDir });

    journal.append(envelope({ id: "evt-1", seq: 1 }));
    journal.append(envelope({ id: "evt-2", seq: 2 }));

    expect(await journal.read("pi-session-1")).toEqual([
      envelope({ id: "evt-1", seq: 1 }),
      envelope({ id: "evt-2", seq: 2 }),
    ]);

    const lines = (await readFile(join(dataDir, "sessions", "pi-session-1.jsonl"), "utf8"))
      .trim()
      .split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(envelope({ id: "evt-1", seq: 1 }));
  });

  it("reads a prior process's journal back from disk after a restart", async () => {
    const dataDir = await tempDataDir();
    const firstProcess = createFileSessionEventJournal({ dataDir });

    firstProcess.append(envelope({ id: "evt-1", seq: 1 }));
    firstProcess.append(envelope({ id: "evt-2", seq: 2 }));
    await firstProcess.read("pi-session-1");

    const secondProcess = createFileSessionEventJournal({ dataDir });

    expect(await secondProcess.read("pi-session-1")).toEqual([
      envelope({ id: "evt-1", seq: 1 }),
      envelope({ id: "evt-2", seq: 2 }),
    ]);
    expect(await secondProcess.read("pi-session-unknown")).toEqual([]);
  });

  it("keeps journal file names safe for hostile session ids", async () => {
    const dataDir = await tempDataDir();
    const journal = createFileSessionEventJournal({ dataDir });
    const piSessionId = "../escape/attempt";

    journal.append(envelope({ id: "evt-1", seq: 1, piSessionId }));

    expect(await journal.read(piSessionId)).toEqual([
      envelope({ id: "evt-1", seq: 1, piSessionId }),
    ]);

    const reopened = createFileSessionEventJournal({ dataDir });

    expect(await reopened.read(piSessionId)).toEqual([
      envelope({ id: "evt-1", seq: 1, piSessionId }),
    ]);
  });
});
