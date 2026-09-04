import { useEffect, useRef, useState } from "react";
import type { SessionChanges } from "@pigui/core";
import { getSessionChanges, checkoutSessionBranch } from "@/entities/session/sessions";

/**
 * One read of a Session's working tree, shared by everything that shows it:
 * the composer git-branch chip, the Changes panel, and the inspector rail
 * badge (ADR-0028). Keeping the read here — rather than inside each surface —
 * is what lets the footer and the rail share one Git round-trip.
 */
export type SessionChangesView = {
  changes: SessionChanges | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
  checkoutBranch: (branch: string) => Promise<void>;
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
  checkoutSessionBranch: checkout = checkoutSessionBranch,
}: {
  sessionId: string | null;
  /** False while nothing displays the branch or the diff, so Git stays untouched. */
  enabled?: boolean;
  loadChanges?: typeof getSessionChanges;
  checkoutSessionBranch?: typeof checkoutSessionBranch;
}): SessionChangesView {
  const [refreshKey, setRefreshKey] = useState(0);
  const [settled, setSettled] = useState<SettledRead | null>(null);
  // Derived during render, so `loading` is already true on the render that
  // asks for a new read; a later setState would flash the clean-tree copy.
  const requestKey = enabled && sessionId ? `${sessionId}:${refreshKey}` : null;
  const current = settled?.key === requestKey ? settled : null;
  const requestKeyRef = useRef(requestKey);
  requestKeyRef.current = requestKey;
  // Checkout does not change requestKey, so the in-flight load effect is not
  // cleaned up. Bump this on a successful switch so a slower read cannot
  // replace the post-checkout tree.
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    if (!requestKey || !sessionId) {
      return;
    }

    let cancelled = false;
    const generation = loadGenerationRef.current;

    void loadChanges(sessionId)
      .then((changes) => {
        if (!cancelled && generation === loadGenerationRef.current) {
          setSettled({ key: requestKey, changes, error: null });
        }
      })
      .catch((loadError) => {
        if (!cancelled && generation === loadGenerationRef.current) {
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
    checkoutBranch: async (branch: string) => {
      if (!sessionId) {
        throw new Error("No Session is bound to check out a branch.");
      }

      const next = await checkout(sessionId, branch);
      loadGenerationRef.current += 1;
      setSettled({
        key: requestKeyRef.current ?? `${sessionId}:${refreshKey}`,
        changes: next,
        error: null,
      });
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
