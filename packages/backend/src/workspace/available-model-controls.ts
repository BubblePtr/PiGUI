// List RuntimeModelControls from Pi ModelRegistry + AuthStorage without an
// open Agent Session (draft create / DF-011).

import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type {
  RuntimeModelCapability,
  RuntimeModelControls,
  RuntimeModelSelection,
  RuntimeThinkingLevel,
} from "@pigui/core";

const thinkingLevelOrder: RuntimeThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function thinkingLevelsForModel(model: {
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<RuntimeThinkingLevel, string | null>>;
}): RuntimeThinkingLevel[] {
  if (!model.reasoning) {
    return ["off"];
  }

  return thinkingLevelOrder.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];

    if (mapped === null) {
      return false;
    }

    return level !== "xhigh" || mapped !== undefined;
  });
}

function capabilityFromRegistryModel(model: {
  id: string;
  name?: string;
  provider: string;
  reasoning?: boolean;
  thinkingLevelMap?: Partial<Record<RuntimeThinkingLevel, string | null>>;
}): RuntimeModelCapability {
  return {
    provider: model.provider,
    modelId: model.id,
    name: typeof model.name === "string" && model.name.trim() ? model.name : model.id,
    thinkingLevels: thinkingLevelsForModel(model),
  };
}

function defaultSelection(
  models: RuntimeModelCapability[],
  preferred?: { provider?: string; modelId?: string; thinkingLevel?: string },
): RuntimeModelSelection | null {
  if (!models.length) {
    return null;
  }

  const preferredModel =
    preferred?.provider && preferred.modelId
      ? models.find(
          (model) =>
            model.provider === preferred.provider && model.modelId === preferred.modelId,
        )
      : undefined;
  const model = preferredModel ?? models[0]!;
  const thinkingLevel =
    preferred?.thinkingLevel &&
    model.thinkingLevels.includes(preferred.thinkingLevel as RuntimeThinkingLevel)
      ? (preferred.thinkingLevel as RuntimeThinkingLevel)
      : (model.thinkingLevels[model.thinkingLevels.length - 1] ?? "off");

  return {
    provider: model.provider,
    modelId: model.modelId,
    thinkingLevel,
  };
}

async function readSettingsPreferredModel(agentDir: string) {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(join(agentDir, "settings.json"), "utf8")) as unknown;
    if (!isRecord(raw)) {
      return undefined;
    }

    const provider =
      (typeof raw.defaultProvider === "string" && raw.defaultProvider) ||
      (typeof raw.default_provider === "string" && raw.default_provider) ||
      (typeof raw.provider === "string" && raw.provider) ||
      undefined;
    const modelId =
      (typeof raw.defaultModel === "string" && raw.defaultModel) ||
      (typeof raw.default_model === "string" && raw.default_model) ||
      (typeof raw.model === "string" && raw.model) ||
      undefined;
    const thinkingLevel =
      (typeof raw.defaultThinkingLevel === "string" && raw.defaultThinkingLevel) ||
      (typeof raw.thinkingLevel === "string" && raw.thinkingLevel) ||
      undefined;

    return { provider, modelId, thinkingLevel };
  } catch {
    return undefined;
  }
}

export async function listAvailableModelControls(input: {
  agentDir: string;
}): Promise<RuntimeModelControls> {
  const authPath = join(input.agentDir, "auth.json");
  const modelsJsonPath = join(input.agentDir, "models.json");
  const authStorage = AuthStorage.create(authPath);
  const registry = ModelRegistry.create(authStorage, modelsJsonPath);
  registry.refresh();

  const models = registry
    .getAvailable()
    .map((model) =>
      capabilityFromRegistryModel({
        id: model.id,
        name: model.name,
        provider: model.provider,
        reasoning: Boolean((model as { reasoning?: boolean }).reasoning),
        thinkingLevelMap: (model as {
          thinkingLevelMap?: Partial<Record<RuntimeThinkingLevel, string | null>>;
        }).thinkingLevelMap,
      }),
    )
    .sort((left, right) => {
      const providerCompare = left.provider.localeCompare(right.provider);
      if (providerCompare !== 0) {
        return providerCompare;
      }

      return left.name.localeCompare(right.name);
    });

  const preferred = await readSettingsPreferredModel(input.agentDir);

  return {
    models,
    selected: defaultSelection(models, preferred),
  };
}
