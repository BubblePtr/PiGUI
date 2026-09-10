import { useEffect, useMemo, useState } from "react";
import type { SessionChanges } from "@pace/core";
import { getSessionChanges, checkoutSessionBranch } from "@/entities/session/sessions";
import { onBackendEvent } from "@/shared/runtime";

/** One working-tree snapshot shared by the branch chip, Changes and rail badge. */
export type SessionChangesView = {
  changes: SessionChanges | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
  checkoutBranch: (branch: string) => Promise<void>;
};

type ReadScope = {
  active: boolean;
  generation: number;
  inFlight: boolean;
  dirty: boolean;
  refresh: () => void;
};

type ReadState = {
  scope: ReadScope;
  changes: SessionChanges | null;
  error: string | null;
  busy: boolean;
};

export function useSessionChanges({
  sessionId,
  enabled = true,
  loadChanges = getSessionChanges,
  checkoutSessionBranch: checkout = checkoutSessionBranch,
}: {
  sessionId: string | null;
  /** False while nothing displays the branch or the diff, so Git stays untouched. */
  enabled?: boolean;
  loadChanges?: typeof getSessionChanges;
  checkoutSessionBranch?: typeof checkoutSessionBranch;
}): SessionChangesView {
  const scope = useMemo<ReadScope>(
    () => ({
      active: false,
      generation: 0,
      inFlight: false,
      dirty: false,
      refresh: () => {},
    }),
    [sessionId, enabled, loadChanges],
  );
  const [state, setState] = useState<ReadState | null>(null);
  const current = enabled && sessionId && state?.scope === scope ? state : null;

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const readSessionId = sessionId;
    scope.active = true;
    async function read() {
      if (!scope.active) return;
      if (scope.inFlight) {
        scope.dirty = true;
        return;
      }
      scope.inFlight = true;
      scope.dirty = false;
      const generation = scope.generation;
      setState((previous) => ({
        scope,
        changes: previous?.scope === scope ? previous.changes : null,
        error: null,
        busy: true,
      }));
      try {
        const changes = await loadChanges(readSessionId);
        if (scope.active && generation === scope.generation) {
          setState({ scope, changes, error: null, busy: true });
        }
      } catch (error) {
        if (scope.active && generation === scope.generation) {
          setState((previous) => ({
            scope,
            changes: previous?.scope === scope ? previous.changes : null,
            error: error instanceof Error
              ? error.message
              : "Session changes could not be loaded.",
            busy: true,
          }));
        }
      } finally {
        scope.inFlight = false;
        if (scope.active) {
          if (scope.dirty) {
            void read();
          } else {
            setState((previous) => previous?.scope === scope
              ? { ...previous, busy: false }
              : previous);
          }
        }
      }
    }
    scope.refresh = () => {
      void read();
    };
    scope.refresh();
    let scheduled = false;
    const invalidate = () => {
      if (!scope.active || document.visibilityState === "hidden" || scheduled) return;
      scheduled = true;
      // Focus and visibility often describe the same activation.
      queueMicrotask(() => {
        scheduled = false;
        if (scope.active) scope.refresh();
      });
    };
    const unsubscribe = onBackendEvent(({ event }) => {
      if (
        event.payload.lifecycle === "connected" ||
        (event.type === "workspace.invalidated" &&
          Array.isArray(event.payload.sessionIds) &&
          event.payload.sessionIds.includes(sessionId))
      ) {
        invalidate();
      }
    });
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", invalidate);
    return () => {
      scope.active = false;
      scope.generation += 1;
      scope.dirty = false;
      unsubscribe();
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", invalidate);
    };
  }, [scope, enabled, sessionId, loadChanges]);

  return {
    changes: current?.changes ?? null,
    error: current?.error ?? null,
    loading: Boolean(enabled && sessionId && !current?.changes && (!current || current.busy)),
    refreshing: Boolean(current?.changes && current.busy),
    refresh: () => scope.refresh(),
    checkoutBranch: async (branch) => {
      if (!sessionId) throw new Error("No Session is bound to check out a branch.");
      const next = await checkout(sessionId, branch);
      if (!scope.active) return;
      // A read started before checkout cannot overwrite its newer snapshot.
      scope.generation += 1;
      setState({ scope, changes: next, error: null, busy: scope.inFlight });
    },
  };
}

/**
 * Rail badge for the Changes surface. It reports the same number the panel's
 * totals row shows, and nothing at all while the count would be noise: no read
 * yet, a failed read, a clean tree, or a checkout that is not a repository.
 */
export function sessionChangesBadge(changes: SessionChanges | null) {
  if (!changes || changes.state !== "ready" || changes.totals.files === 0) {
    return undefined;
  }

  return String(changes.totals.files);
}
