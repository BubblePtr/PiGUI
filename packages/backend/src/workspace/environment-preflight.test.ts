import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEnvironmentPreflightReader } from "./environment-preflight";

async function tempRoots() {
  const root = await mkdtemp(join(tmpdir(), "pigui-preflight-"));
  const agentDir = join(root, "agent");
  const dataDir = join(root, "data");
  await mkdir(agentDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  return { root, agentDir, dataDir };
}

describe("environment preflight", () => {
  it("passes required checks when pi, data dir, and auth are ready", async () => {
    const { agentDir, dataDir } = await tempRoots();
    await writeFile(
      join(agentDir, "auth.json"),
      JSON.stringify({ openai: { type: "api_key", key: "test-key" } }),
      "utf8",
    );

    const reader = createEnvironmentPreflightReader({
      agentDir,
      dataDir,
      whichCommand: async (command) => (command === "pi" || command === "git" ? `/bin/${command}` : null),
      runVersion: async (command) =>
        command.endsWith("pi") ? "pi 0.1.0" : "git version 2.45.0",
    });

    const report = await reader.run();
    expect(report.requiredPassed).toBe(true);
    expect(report.canContinue).toBe(true);
    expect(report.checks.map((check) => check.id)).toEqual([
      "pi_runtime",
      "data_directory",
      "model_auth",
      "git",
    ]);
    expect(report.checks.find((check) => check.id === "git")?.status).toBe("pass");
  });

  it("fails required pi and auth checks without blocking optional git skip", async () => {
    const { agentDir, dataDir } = await tempRoots();
    const reader = createEnvironmentPreflightReader({
      agentDir,
      dataDir,
      whichCommand: async () => null,
      runVersion: async () => {
        throw new Error("unreachable");
      },
    });

    const report = await reader.run();
    expect(report.requiredPassed).toBe(false);
    expect(report.canContinue).toBe(false);
    expect(report.checks.find((check) => check.id === "pi_runtime")?.status).toBe("fail");
    expect(report.checks.find((check) => check.id === "model_auth")?.status).toBe("fail");
    expect(report.checks.find((check) => check.id === "git")?.status).toBe("skip");
  });

  it("refuses complete while required checks fail and persists on success", async () => {
    const { agentDir, dataDir } = await tempRoots();
    await writeFile(
      join(agentDir, "auth.json"),
      JSON.stringify({ openai: { type: "api_key", key: "test-key" } }),
      "utf8",
    );

    const failing = createEnvironmentPreflightReader({
      agentDir,
      dataDir,
      whichCommand: async (command) => (command === "git" ? "/usr/bin/git" : null),
      runVersion: async () => "git version 2.45.0",
      now: () => new Date("2026-07-25T12:00:00.000Z"),
    });
    await expect(failing.complete()).rejects.toThrow(/required checks/i);

    const ready = createEnvironmentPreflightReader({
      agentDir,
      dataDir,
      whichCommand: async (command) =>
        command === "pi" || command === "git" ? `/usr/bin/${command}` : null,
      runVersion: async () => "ok",
      now: () => new Date("2026-07-25T12:00:00.000Z"),
    });
    const status = await ready.complete();
    expect(status.completedAt).toBe("2026-07-25T12:00:00.000Z");
    await expect(ready.getStatus()).resolves.toEqual(
      expect.objectContaining({ completedAt: "2026-07-25T12:00:00.000Z" }),
    );
  });
});
