import type {
  RuntimeModelControls,
  RuntimeModelSelection,
  RuntimeThinkingLevel,
} from "@pigui/core";

const storageKey = "pigui.lastModelSelection.v1";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isThinkingLevel(value: unknown): value is RuntimeThinkingLevel {
  return (
    value === "off" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
  );
}

function isModelSelection(value: unknown): value is RuntimeModelSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { provider?: unknown }).provider === "string" &&
    typeof (value as { modelId?: unknown }).modelId === "string" &&
    isThinkingLevel((value as { thinkingLevel?: unknown }).thinkingLevel)
  );
}

export function getLastModelSelection(): RuntimeModelSelection | null {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  const raw = storage.getItem(storageKey);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return isModelSelection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastModelSelection(selection: RuntimeModelSelection) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(
    storageKey,
    JSON.stringify({
      provider: selection.provider,
      modelId: selection.modelId,
      thinkingLevel: selection.thinkingLevel,
    }),
  );
}

function applyPreferredModel(
  controls: RuntimeModelControls,
  preferred: RuntimeModelSelection,
): RuntimeModelControls | null {
  const model = controls.models.find(
    (candidate) =>
      candidate.provider === preferred.provider &&
      candidate.modelId === preferred.modelId,
  );

  if (!model) {
    return null;
  }

  const thinkingLevel = model.thinkingLevels.includes(preferred.thinkingLevel)
    ? preferred.thinkingLevel
    : (model.thinkingLevels[model.thinkingLevels.length - 1] ?? "off");

  return {
    ...controls,
    selected: {
      provider: model.provider,
      modelId: model.modelId,
      thinkingLevel,
    },
  };
}

export function overlayPreferredModel(
  controls: RuntimeModelControls,
  preferences: Array<RuntimeModelSelection | null | undefined>,
): RuntimeModelControls {
  for (const preferred of preferences) {
    if (!preferred) {
      continue;
    }

    const applied = applyPreferredModel(controls, preferred);

    if (applied) {
      return applied;
    }
  }

  return controls;
}

export function mostRecentSessionModelSelection(
  projections: Array<{
    updatedAt: string;
    modelControls: { selected: RuntimeModelSelection | null } | null;
  }>,
): RuntimeModelSelection | null {
  let latest: { updatedAt: string; selected: RuntimeModelSelection } | null = null;

  for (const projection of projections) {
    const selected = projection.modelControls?.selected;

    if (!selected) {
      continue;
    }

    if (!latest || projection.updatedAt.localeCompare(latest.updatedAt) > 0) {
      latest = { updatedAt: projection.updatedAt, selected };
    }
  }

  return latest?.selected ?? null;
}
