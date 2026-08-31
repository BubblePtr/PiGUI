import { beforeEach, describe, expect, it } from "vitest";
import {
  getVisibleModels,
  saveVisibleModels,
  visibleModelsStorageKey,
} from "@/entities/model/visible-models";

describe("visible models preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips the visible model set and starts out unconfigured", () => {
    expect(getVisibleModels()).toEqual([]);

    saveVisibleModels([
      { provider: "xai", modelId: "grok-4" },
      { provider: "anthropic", modelId: "claude-sonnet-4" },
    ]);

    expect(getVisibleModels()).toEqual([
      { provider: "xai", modelId: "grok-4" },
      { provider: "anthropic", modelId: "claude-sonnet-4" },
    ]);
  });

  it("reads an unusable stored value as unconfigured instead of throwing", () => {
    window.localStorage.setItem(visibleModelsStorageKey, "{not json");

    expect(getVisibleModels()).toEqual([]);

    window.localStorage.setItem(visibleModelsStorageKey, '[{"provider":"xai"}]');

    expect(getVisibleModels()).toEqual([]);
  });
});
