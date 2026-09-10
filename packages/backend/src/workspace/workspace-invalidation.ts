import { resolve } from "node:path";
import type { WorkspaceInvalidatedPayload } from "@pace/core";

type Pending = {
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
    if (!cancel(checkoutId)) return;
    emit({
      checkoutId,
      sessionIds: [...sessions]
        .filter(([, root]) => root === checkoutId)
        .map(([id]) => id),
      source: "tool",
    });
  }

  function remove(sessionId: string) {
    const root = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (root && ![...sessions.values()].includes(root)) cancel(root);
  }

  return {
    associate(sessionId: string, root: string) {
      const normalized = resolve(root);
      if (sessions.get(sessionId) === normalized) return;
      remove(sessionId);
      sessions.set(sessionId, normalized);
    },
    remove,
    invalidate(sessionId: string) {
      const root = sessions.get(sessionId);
      if (!root) return;
      const previous = pending.get(root);
      if (previous) clearTimeout(previous.trailing);
      pending.set(root, {
        trailing: setTimeout(() => flushCheckout(root), 500),
        // Continuous tools must not postpone convergence indefinitely.
        deadline: previous?.deadline ?? setTimeout(() => flushCheckout(root), 2000),
      });
    },
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
