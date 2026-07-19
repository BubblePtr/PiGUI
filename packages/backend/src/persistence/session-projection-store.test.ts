import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createFileSessionProjectionStore,
  createInMemorySessionProjectionStore,
  mergeSessionProjection,
  projectionFromRuntimeSnapshot,
  repairProjectionSessionFiles,
} from "./session-projection-store";

const snapshot = {
  sessionId: "app-session-1",
  runtimeId: "runtime:app-session-1",
  piSessionId: "pi-session-1",
  projectId: "pig",
  cwd: "/repo",
  status: "idle" as const,
  sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-1.jsonl",
  events: [],
  updatedAt: "2026-07-03T10:00:00.000Z",
};

describe("session projection store", () => {
  it("maps runtime snapshots to persisted projection records with Pi session files", () => {
    expect(projectionFromRuntimeSnapshot(snapshot)).toEqual({
      sessionId: "app-session-1",
      runtimeId: "runtime:app-session-1",
      piSessionId: "pi-session-1",
      projectId: "pig",
      cwd: "/repo",
      status: "idle",
      sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-1.jsonl",
      checkout: undefined,
      summary: undefined,
      modelSelection: undefined,
      updatedAt: "2026-07-03T10:00:00.000Z",
    });
  });

  it("persists only the selected model pair from runtime capabilities", () => {
    expect(
      projectionFromRuntimeSnapshot({
        ...snapshot,
        modelControls: {
          models: [
            {
              provider: "anthropic",
              modelId: "claude-sonnet-4",
              name: "Claude Sonnet 4",
              thinkingLevels: ["off", "high"],
            },
          ],
          selected: {
            provider: "anthropic",
            modelId: "claude-sonnet-4",
            thinkingLevel: "high",
          },
        },
      }),
    ).toMatchObject({
      modelSelection: {
        provider: "anthropic",
        modelId: "claude-sonnet-4",
        thinkingLevel: "high",
      },
    });
  });

  it("persists projections under the PiGUI data dir", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "pigui-projections-"));
    const store = createFileSessionProjectionStore({ dataDir });

    await store.save(projectionFromRuntimeSnapshot(snapshot));

    await expect(store.list()).resolves.toEqual([
      projectionFromRuntimeSnapshot(snapshot),
    ]);
  });

  it("repairs missing session files from Pi SessionManager.listAll metadata", async () => {
    const store = createInMemorySessionProjectionStore();
    const projection = projectionFromRuntimeSnapshot({
      ...snapshot,
      sessionFile: undefined,
    });

    await store.save(projection);

    const repaired = repairProjectionSessionFiles(await store.list(), [
      {
        id: "pi-session-1",
        path: "/Users/void/.pi/agent/sessions/pig/pi-session-1.jsonl",
      },
    ]);

    expect(repaired).toEqual([
      {
        ...projection,
        sessionFile: "/Users/void/.pi/agent/sessions/pig/pi-session-1.jsonl",
      },
    ]);
  });

  it("marks unrecoverable missing session files so repair is not retried forever", async () => {
    const projection = projectionFromRuntimeSnapshot({
      ...snapshot,
      sessionFile: undefined,
    });

    expect(repairProjectionSessionFiles([projection], [])).toEqual([
      {
        ...projection,
        sessionFileMissing: true,
      },
    ]);
  });

  it("keeps a failed event result until a later run actually starts", () => {
    const failed = {
      ...projectionFromRuntimeSnapshot(snapshot),
      status: "failed" as const,
      updatedAt: "2026-07-18T12:00:00.000Z",
    };

    expect(
      mergeSessionProjection(failed, {
        ...failed,
        status: "completed",
        updatedAt: "2026-07-18T12:00:01.000Z",
      }),
    ).toMatchObject({ status: "failed" });
    expect(
      mergeSessionProjection(failed, {
        ...failed,
        status: "running",
        updatedAt: "2026-07-18T12:05:00.000Z",
      }),
    ).toMatchObject({ status: "running" });
  });
});
