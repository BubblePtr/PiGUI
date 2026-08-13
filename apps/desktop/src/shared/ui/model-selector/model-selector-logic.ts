// Pure logic for the model selector (issue #99). Decision record:
// .scratch/model-selector/PRD.md

import type {
  RuntimeModelCapability,
  RuntimeThinkingLevel,
} from "@pigui/core";

const FAST_SUFFIX = "-fast";

/**
 * Fast siblings are separate catalog entries in Pi (`grok-3` / `grok-3-fast`),
 * not a model parameter. This `-fast` id-suffix pairing is PiGUI's own
 * grouping so the list can show one row per family plus a Fast Mode switch.
 */
export function fastSiblingOf(
  model: RuntimeModelCapability,
  models: RuntimeModelCapability[],
): RuntimeModelCapability | undefined {
  const siblingId = model.modelId.endsWith(FAST_SUFFIX)
    ? model.modelId.slice(0, -FAST_SUFFIX.length)
    : `${model.modelId}${FAST_SUFFIX}`;

  return models.find(
    (candidate) =>
      candidate.provider === model.provider && candidate.modelId === siblingId,
  );
}

export function isFastModel(model: RuntimeModelCapability): boolean {
  return model.modelId.endsWith(FAST_SUFFIX);
}

/** The family representative shown in lists: always the non-fast base model. */
export function baseModelOf(
  model: RuntimeModelCapability,
  models: RuntimeModelCapability[],
): RuntimeModelCapability {
  if (!isFastModel(model)) {
    return model;
  }

  return fastSiblingOf(model, models) ?? model;
}

/** Tokenized match over name, id, and provider; empty query matches all. */
export function matchesModelQuery(
  model: RuntimeModelCapability,
  query: string,
): boolean {
  const haystack =
    `${model.name} ${model.modelId} ${model.provider}`.toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

const thinkingLevelOrder: RuntimeThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

/**
 * Switching models keeps the thinking level when available, otherwise snaps
 * to the numerically nearest one (ADR-0024 behavior, moved from the previous
 * inline control).
 */
export function nearestThinkingLevel(
  current: RuntimeThinkingLevel,
  available: RuntimeThinkingLevel[],
): RuntimeThinkingLevel {
  const currentIndex = thinkingLevelOrder.indexOf(current);

  return available.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(
      thinkingLevelOrder.indexOf(nearest) - currentIndex,
    );
    const candidateDistance = Math.abs(
      thinkingLevelOrder.indexOf(candidate) - currentIndex,
    );

    return candidateDistance < nearestDistance ? candidate : nearest;
  }, available[0] ?? "off");
}

/** "200K" / "1M" — context windows are round numbers by catalog convention. */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${tokens / 1_000_000}M`;
  }

  return `${Math.round(tokens / 1_000)}K`;
}

export type Point = { x: number; y: number };

/** Sign-of-cross-product point-in-triangle test for the safe-triangle. */
export function isInsideTriangle(
  point: Point,
  a: Point,
  b: Point,
  c: Point,
): boolean {
  const sign = (p1: Point, p2: Point, p3: Point) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNegative && hasPositive);
}
