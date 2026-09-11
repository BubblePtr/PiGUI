import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkspaceInvalidatedPayload } from "@pace/core";

type Pending = {
  source: WorkspaceInvalidatedPayload["source"];
  trailing: ReturnType<typeof setTimeout>;
  deadline: ReturnType<typeof setTimeout>;
};

export function createWorkspaceInvalidation(
  emit: (payload: WorkspaceInvalidatedPayload) => void,
) {
  const sessions = new Map<string, string>();
  const pending = new Map<string, Pending>();

  function cancel(checkoutId: string) {
    const timers = pending.get(checkoutId);
    if (!timers) return false;
    clearTimeout(timers.trailing);
    clearTimeout(timers.deadline);
    pending.delete(checkoutId);
    return true;
  }

  function flushCheckout(checkoutId: string) {
    const source = pending.get(checkoutId)?.source;
    if (!source || !cancel(checkoutId)) return;
    emit({
      checkoutId,
      sessionIds: [...sessions]
        .filter(([, root]) => root === checkoutId)
        .map(([id]) => id),
      source,
    });
  }

  function remove(sessionId: string) {
    const root = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (root && ![...sessions.values()].includes(root)) cancel(root);
  }

  function invalidateCheckout(root: string, source: WorkspaceInvalidatedPayload["source"]) {
    if (![...sessions.values()].includes(root)) return;
    const previous = pending.get(root);
    if (previous) clearTimeout(previous.trailing);
    pending.set(root, {
      source,
      trailing: setTimeout(() => flushCheckout(root), 500),
      // Continuous signals must not postpone convergence indefinitely.
      deadline: previous?.deadline ?? setTimeout(() => flushCheckout(root), 2000),
    });
  }

  return {
    associate(sessionId: string, root: string) {
      let normalized: string;
      try {
        normalized = realpathSync(root);
      } catch {
        // Persisted checkouts can be absent until resume recreates them.
        normalized = resolve(root);
      }
      if (sessions.get(sessionId) === normalized) return normalized;
      remove(sessionId);
      sessions.set(sessionId, normalized);
      return normalized;
    },
    remove,
    invalidate(sessionId: string) {
      const root = sessions.get(sessionId);
      if (root) invalidateCheckout(root, "tool");
    },
    invalidateCheckout,
    flush(sessionId: string) {
      const root = sessions.get(sessionId);
      if (root) flushCheckout(root);
    },
    dispose() {
      for (const root of pending.keys()) cancel(root);
      sessions.clear();
    },
  };
}
