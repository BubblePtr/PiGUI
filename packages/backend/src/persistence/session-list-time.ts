/**
 * Sidebar/list time for a Session Projection: last chat activity
 * (message / control / error), never resume wall-clock.
 * Complements frontend lastChatActivityAt (DF-010) for cold hydrate (DF-012).
 */

export type GatewayEventLike = {
  ts: string;
  payload?: {
    kind?: unknown;
    type?: unknown;
    [key: string]: unknown;
  };
};

function isChatActivityPayload(payload: GatewayEventLike["payload"]): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const kind = payload.kind;
  const type = payload.type;

  return (
    kind === "message" ||
    kind === "error" ||
    kind === "control" ||
    type === "error"
  );
}

export function lastChatActivityAtFromGatewayEvents(
  events: readonly GatewayEventLike[] | undefined,
): string | null {
  let latest: string | null = null;

  for (const event of events ?? []) {
    if (typeof event.ts !== "string" || !event.ts) {
      continue;
    }

    if (!isChatActivityPayload(event.payload)) {
      continue;
    }

    if (!latest || event.ts > latest) {
      latest = event.ts;
    }
  }

  return latest;
}

// Backfill older projections once; new submissions are persisted at command acceptance.
export function lastUserMessageAtFromGatewayEvents(
  events: readonly GatewayEventLike[],
): string | null {
  let latest: string | null = null;
  for (const { ts, payload } of events) {
    if (
      typeof ts === "string" && ts && payload?.role === "user" &&
      (payload.kind === "message" || payload.kind === "control" || payload.type === "message")
    ) {
      if (!latest || ts > latest) latest = ts;
    }
  }
  return latest;
}

/**
 * Prefer last chat activity from events; otherwise keep the previous
 * persisted list time; only then fall back to snapshot wall-clock.
 */
export function resolvePersistedListUpdatedAt(input: {
  events?: readonly GatewayEventLike[];
  previousUpdatedAt?: string | null;
  snapshotUpdatedAt: string;
}): string {
  return (
    lastChatActivityAtFromGatewayEvents(input.events) ??
    input.previousUpdatedAt ??
    input.snapshotUpdatedAt
  );
}
