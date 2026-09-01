import { useEffect, useState } from "react";
import type { SessionChanges } from "@pigui/core";
import { getSessionChanges } from "@/entities/session/sessions";

/**
 * One read of a Session's working tree, shared by everything that shows it:
 * the Changes panel and the inspector rail badge (ADR-0028). Keeping the read
 * here — rather than inside the panel — is what lets the rail carry a count
 * while another surface is on screen, without asking Git twice.
 */
export type SessionChangesView = {
  changes: SessionChanges | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
};

type SettledRead = {
  key: string;
  changes: SessionChanges | null;
  error: string | null;
};

export function useSessionChanges({
  sessionId,
  enabled = true,
  loadChanges = getSessionChanges,
}: {
  sessionId: string | null;
  /** False while nothing displays the diff, so Git stays untouched. */
  enabled?: boolean;
  loadChanges?: typeof getSessionChanges;
}): SessionChangesView {
  const [refreshKey, setRefreshKey] = useState(0);
  const [settled, setSettled] = useState<SettledRead | null>(null);
  // Derived during render, so `loading` is already true on the render that
  // asks for a new read; a later setState would flash the clean-tree copy.
  const requestKey = enabled && sessionId ? `${sessionId}:${refreshKey}` : null;
  const current = settled?.key === requestKey ? settled : null;

  useEffect(() => {
    if (!requestKey || !sessionId) {
      return;
    }

    let cancelled = false;

    void loadChanges(sessionId)
      .then((changes) => {
        if (!cancelled) {
          setSettled({ key: requestKey, changes, error: null });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setSettled({
            key: requestKey,
            changes: null,
            error:
              loadError instanceof Error
                ? loadError.message
                : "Session changes could not be loaded.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadChanges, requestKey, sessionId]);

  return {
    changes: current?.changes ?? null,
    error: current?.error ?? null,
    loading: requestKey !== null && current === null,
    refresh: () => setRefreshKey((value) => value + 1),
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
