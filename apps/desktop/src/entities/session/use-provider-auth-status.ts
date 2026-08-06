import { useEffect, useState } from "react";
import type { ProviderAuthStatusReport } from "@pigui/core";
import { invoke } from "@/shared/runtime";

/**
 * Load provider credential status once. Fail-open (treat as configured) when
 * the backend cannot answer so tests / offline shells stay usable.
 */
export function useProviderAuthStatus() {
  const [report, setReport] = useState<ProviderAuthStatusReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void invoke<ProviderAuthStatusReport>("list_provider_auth_status")
      .then((next) => {
        if (!cancelled) {
          setReport(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReport({
            agentDir: "",
            authPath: "",
            configuredCount: 1,
            providers: [],
          });
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    report,
    loading,
    configured: (report?.configuredCount ?? 0) > 0,
  };
}
