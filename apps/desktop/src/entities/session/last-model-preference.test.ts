import { beforeEach, describe, expect, it } from "vitest";
import type { RuntimeModelControls, RuntimeModelSelection } from "@pigui/core";
import {
  getLastModelSelection,
  mostRecentSessionModelSelection,
  overlayPreferredModel,
  saveLastModelSelection,
} from "@/entities/session/last-model-preference";

const deepseek: RuntimeModelSelection = {
  provider: "deepseek",
  modelId: "deepseek-chat",
  thinkingLevel: "off",
};

const gptSol: RuntimeModelSelection = {
  provider: "openai-codex",
  modelId: "gpt-5.6-sol",
  thinkingLevel: "high",
};

const catalog: RuntimeModelControls = {
  models: [
    {
      provider: "deepseek",
      modelId: "deepseek-chat",
      name: "DeepSeek Chat",
      thinkingLevels: ["off"],
    },
    {
      provider: "openai-codex",
      modelId: "gpt-5.6-sol",
      name: "GPT-5.6 SOL",
      thinkingLevels: ["off", "low", "medium", "high"],
    },
  ],
  selected: deepseek,
};

describe("last model preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips the last selected model pair", () => {
    expect(getLastModelSelection()).toBeNull();

    saveLastModelSelection(gptSol);

    expect(getLastModelSelection()).toEqual(gptSol);
  });

  it("persists only the model pair, not session identity fields", () => {
    saveLastModelSelection({
      ...gptSol,
      sessionId: "session-1",
      piSessionId: "pi-session-1",
    } as RuntimeModelSelection);

    expect(getLastModelSelection()).toEqual(gptSol);
  });

  it("overlays a still-available last selection over the catalog default", () => {
    expect(overlayPreferredModel(catalog, [gptSol]).selected).toEqual(gptSol);
  });

  it("keeps the catalog default when the preferred model has left the catalog", () => {
    expect(
      overlayPreferredModel(catalog, [
        {
          provider: "openai",
          modelId: "missing-model",
          thinkingLevel: "high",
        },
      ]).selected,
    ).toEqual(deepseek);
  });

  it("clamps thinking to a level the preferred model still offers", () => {
    expect(
      overlayPreferredModel(catalog, [
        {
          ...gptSol,
          thinkingLevel: "max",
        },
      ]).selected,
    ).toEqual({
      ...gptSol,
      thinkingLevel: "high",
    });
  });

  it("walks preference sources until one is still in the catalog", () => {
    expect(
      overlayPreferredModel(catalog, [
        {
          provider: "openai",
          modelId: "gone",
          thinkingLevel: "high",
        },
        gptSol,
      ]).selected,
    ).toEqual(gptSol);
  });

  it("picks the most recently updated session model selection", () => {
    expect(
      mostRecentSessionModelSelection([
        {
          updatedAt: "2026-08-20T08:00:00.000Z",
          modelControls: { selected: deepseek },
        },
        {
          updatedAt: "2026-08-27T08:00:00.000Z",
          modelControls: { selected: gptSol },
        },
        {
          updatedAt: "2026-08-26T08:00:00.000Z",
          modelControls: null,
        },
      ]),
    ).toEqual(gptSol);
  });
});
