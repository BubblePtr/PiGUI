import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listAvailableModelControls } from "./available-model-controls";

async function tempAgentDir() {
  return mkdtemp(join(tmpdir(), "pigui-model-controls-"));
}

describe("listAvailableModelControls", () => {
  it("returns empty models when no auth is configured", async () => {
    const agentDir = await tempAgentDir();
    const controls = await listAvailableModelControls({ agentDir });

    expect(controls.models).toEqual([]);
    expect(controls.selected).toBeNull();
  });

  it("lists models for a configured provider", async () => {
    const agentDir = await tempAgentDir();
    await writeFile(
      join(agentDir, "auth.json"),
      JSON.stringify({ openai: { type: "api_key", key: "sk-test-openai" } }),
      "utf8",
    );

    const controls = await listAvailableModelControls({ agentDir });

    expect(controls.models.length).toBeGreaterThan(0);
    expect(controls.models.every((model) => model.provider && model.modelId)).toBe(true);
    expect(controls.selected).not.toBeNull();
    expect(controls.models.some((model) => model.provider === "openai")).toBe(true);
  });

  it("passes catalog metadata (context window, max tokens, modalities) through", async () => {
    const agentDir = await tempAgentDir();
    await writeFile(
      join(agentDir, "auth.json"),
      JSON.stringify({ openai: { type: "api_key", key: "sk-test-openai" } }),
      "utf8",
    );

    const controls = await listAvailableModelControls({ agentDir });

    // Every catalog model ships these fields; the mapping must not drop them.
    expect(
      controls.models.every(
        (model) =>
          typeof model.contextWindow === "number" && model.contextWindow > 0,
      ),
    ).toBe(true);
    expect(
      controls.models.every(
        (model) => typeof model.maxTokens === "number" && model.maxTokens > 0,
      ),
    ).toBe(true);
    expect(
      controls.models.every(
        (model) =>
          Array.isArray(model.input) && model.input.includes("text"),
      ),
    ).toBe(true);
  });
});
