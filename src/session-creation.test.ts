import { describe, expect, it } from "vitest";
import { createFakePiRuntimeBridge } from "./pi-runtime-bridge";
import {
  createInMemorySessionProjectionStore,
  createSessionFromDraft,
} from "./session-creation";

describe("Session Creation state machine", () => {
  it("submits a draft into a resumable Live Session through the fake Pi Runtime Bridge", async () => {
    const projections = createInMemorySessionProjectionStore();
    const observedStages: string[] = [];

    const result = await createSessionFromDraft({
      bridge: createFakePiRuntimeBridge({
        now: () => "2026-06-26T08:00:03.000Z",
      }),
      projections,
      draft: {
        projectId: "pig",
        prompt: "Create a resumable live session",
        updatedAt: "2026-06-26T08:00:00.000Z",
      },
      project: {
        id: "pig",
        repoRoot: "/Users/void/code/opensource/Pig",
        projectRoot: "/Users/void/code/opensource/Pig",
      },
      now: () => "2026-06-26T08:00:00.000Z",
      idFactory: () => "session-1",
      onProjectionChange: (projection) => {
        observedStages.push(projection.creationStage);
      },
    });

    expect(result).toMatchObject({
      ok: true,
      clearDraft: true,
      projection: {
        id: "session-1",
        projectId: "pig",
        status: "running",
        creationStage: "accepted",
        checkout: {
          mode: "foreground-local",
          root: "/Users/void/code/opensource/Pig",
          runtimeCwd: "/Users/void/code/opensource/Pig",
        },
        runtimeId: "runtime-1",
        piSessionId: "pi-session-1",
        runtimeEvents: [
          expect.objectContaining({
            kind: "message",
            role: "user",
            body: "Create a resumable live session",
          }),
        ],
      },
    });
    expect(projections.get("session-1")).toEqual(result.projection);
    expect(observedStages).toEqual([
      "preparing checkout",
      "preparing checkout",
      "starting runtime",
      "sending prompt",
      "accepted",
    ]);
  });

  it.each([
    ["start-runtime", "starting runtime"],
    ["create-pi-session-state", "starting runtime"],
    ["send-initial-prompt", "sending prompt"],
  ] as const)(
    "keeps the draft recoverable and records failure detail when %s fails",
    async (failAt, failureStage) => {
      const projections = createInMemorySessionProjectionStore();
      const observedStages: string[] = [];

      const result = await createSessionFromDraft({
        bridge: createFakePiRuntimeBridge({
          failAt,
          failureMessage: `Failure while ${failureStage}`,
        }),
        projections,
        draft: {
          projectId: "pig",
          prompt: "Create a resumable live session",
          updatedAt: "2026-06-26T08:00:00.000Z",
        },
        project: {
          id: "pig",
          repoRoot: "/Users/void/code/opensource/Pig",
          projectRoot: "/Users/void/code/opensource/Pig",
        },
        now: () => "2026-06-26T08:00:00.000Z",
        idFactory: () => `session-${failAt}`,
        onProjectionChange: (projection) => {
          observedStages.push(projection.creationStage);
        },
      });

      expect(result).toMatchObject({
        ok: false,
        clearDraft: false,
        projection: {
          id: `session-${failAt}`,
          projectId: "pig",
          initialPrompt: "Create a resumable live session",
          status: "failed",
          creationStage: "failed",
          failure: {
            stage: failureStage,
            message: `Failure while ${failureStage}`,
          },
        },
      });
      expect(projections.get(`session-${failAt}`)).toEqual(result.projection);
      expect(observedStages[observedStages.length - 1]).toBe("failed");
    },
  );
});
