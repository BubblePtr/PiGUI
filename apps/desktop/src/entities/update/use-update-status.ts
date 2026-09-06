import { useEffect, useState } from "react";
import { invoke, onUpdateEvent } from "@/shared/runtime";
import type { UpdateStatus } from "@/shared/update-protocol";

/**
 * Shared updater snapshot for Settings and the sidebar badge.
 *
 * useState rather than react-query: AppFrame is mounted by many page tests
 * that do not wrap a QueryClientProvider.
 */
export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    void invoke<UpdateStatus>("update:status")
      .then((next) => {
        if (!cancelled) {
          setStatus(next);
        }
      })
      .catch(() => {
        // Leave status null so the sidebar stays badge-less when the
        // updater cannot answer (tests without a mock, offline shells).
      });

    const unsubscribe = onUpdateEvent((next) => {
      if (!cancelled) {
        setStatus(next);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return status;
}
