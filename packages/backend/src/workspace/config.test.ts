import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildConfigInventory } from "./config";

function fixtureAgentDir() {
  return join(process.cwd(), "fixtures/pi-agent");
}

describe("backend config inventory", () => {
  it("reads settings and local inventory without exposing auth data", async () => {
    const inventory = await buildConfigInventory(fixtureAgentDir());

    expect(inventory).toEqual({
      defaultModel: "gpt-5-codex",
      defaultProvider: "openai",
      defaultThinkingLevel: "high",
      theme: "system",
      packages: ["@pi/code", "@pi/docs"],
      extensions: [
        {
          name: "code-runner",
          source: "settings,directory",
          enabled: true,
        },
        {
          name: "terminal-tools",
          source: "settings",
          enabled: true,
        },
      ],
      skills: [
        {
          name: "review",
          source: "directory",
        },
        {
          name: "summarize",
          source: "directory",
        },
      ],
      promptTemplates: [],
    });
    expect(JSON.stringify(inventory)).not.toContain("sk-test");
  });

  it("allows missing settings and inventory directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pig-empty-agent-"));

    await expect(buildConfigInventory(dir)).resolves.toEqual({
      packages: [],
      extensions: [],
      skills: [],
      promptTemplates: [],
    });
  });
});
