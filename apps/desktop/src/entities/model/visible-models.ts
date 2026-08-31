// Which catalog models the composer selector may list (issue #102). Managed
// on the Settings page, read by the selector. Same renderer-local settings
// channel as the other PiGUI preferences (localStorage, `pigui.*` keys) —
// Pi's own settings.json stays Pi's.

import type { ModelRef } from "@/shared/ui/model-selector/model-selector-logic";

export const visibleModelsStorageKey = "pigui.visibleModels.v1";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isModelRef(value: unknown): value is ModelRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { provider?: unknown }).provider === "string" &&
    typeof (value as { modelId?: unknown }).modelId === "string"
  );
}

/** Empty means "not configured yet": the selector then shows every model. */
export function getVisibleModels(): ModelRef[] {
  const raw = getStorage()?.getItem(visibleModelsStorageKey);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed) && parsed.every(isModelRef)
      ? parsed.map(({ provider, modelId }) => ({ provider, modelId }))
      : [];
  } catch {
    return [];
  }
}

export function saveVisibleModels(models: ModelRef[]) {
  getStorage()?.setItem(
    visibleModelsStorageKey,
    JSON.stringify(
      models.map(({ provider, modelId }) => ({ provider, modelId })),
    ),
  );
}
