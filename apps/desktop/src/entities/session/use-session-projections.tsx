import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { PersistedSessionProjection } from "@pigui/backend";
import { onBackendEvent } from "@/shared/runtime";
import { shouldUseBrowserDevelopmentData } from "@/shared/browser-development-data";
import {
  defaultRuntimeSummary,
  type ExecutionCheckout,
} from "@/entities/runtime/pi-runtime-bridge";
import {
  createSessionProjection,
  type SessionProjection,
} from "@/entities/session/session-projection";
import { listSessionProjections } from "@/entities/session/sessions";

function sessionStatusFromPersistedProjection(
  status: PersistedSessionProjection["status"],
): SessionProjection["status"] {
  switch (status) {
    case "archived":
      return "archived";
    case "running":
    case "failed":
    case "completed":
      return status;
    case "idle":
    default:
      return "waiting";
  }
}

function checkoutFromPersistedProjection(
  checkout: PersistedSessionProjection["checkout"],
) {
  if (typeof checkout !== "object" || checkout === null) {
    return null;
  }

  return checkout as ExecutionCheckout;
}

export function sessionProjectionFromPersistedProjection(
  record: PersistedSessionProjection,
): SessionProjection {
  const projection = createSessionProjection({
    id: record.sessionId,
    projectId: record.projectId,
    initialPrompt: record.initialPrompt ?? "Untitled Session",
    createdAt: record.updatedAt,
  });
  const sessionFileMissing = Boolean(record.sessionFileMissing || !record.sessionFile);

  return {
    ...projection,
    cwd: record.cwd,
    status: sessionStatusFromPersistedProjection(record.status),
    creationStage: "accepted",
    checkout: checkoutFromPersistedProjection(record.checkout),
    runtimeId: record.runtimeId,
    piSessionId: record.piSessionId,
    sessionFile: record.sessionFile ?? null,
    summary: defaultRuntimeSummary(record.summary),
    modelControls: record.modelSelection
      ? {
          models: [],
          selected: { ...record.modelSelection },
        }
      : null,
    stale: sessionFileMissing,
    staleReason: sessionFileMissing
      ? "Session file is missing. Start a new PiGUI Session to continue from this Project."
      : null,
    archivedAt:
      record.archivedAt ??
      (record.status === "archived" ? record.updatedAt : null),
    updatedAt: record.updatedAt,
  };
}

type SessionProjectionsContextValue = {
  sessionProjections: SessionProjection[];
  sessionsHydrated: boolean;
  backendGeneration: number;
  setSessionProjections: Dispatch<SetStateAction<SessionProjection[]>>;
  refreshSessionProjections: () => Promise<void>;
};

const SessionProjectionsContext = createContext<SessionProjectionsContextValue | null>(
  null,
);

const retryDelaysMs = [0, 150, 300, 600, 1200, 2000, 3000, 4000];

export function SessionProjectionsProvider({ children }: { children: ReactNode }) {
  const browserDevelopmentData = useMemo(() => shouldUseBrowserDevelopmentData(), []);
  const [sessionProjections, setSessionProjections] = useState<SessionProjection[]>(
    [],
  );
  const [sessionsHydrated, setSessionsHydrated] = useState(
    () => browserDevelopmentData,
  );
  const [backendGeneration, setBackendGeneration] = useState(0);

  const refreshSessionProjections = useCallback(async () => {
    if (browserDevelopmentData) {
      setSessionsHydrated(true);
      return;
    }

    const records = await listSessionProjections();
    setSessionProjections(records.map(sessionProjectionFromPersistedProjection));
    setSessionsHydrated(true);
  }, [browserDevelopmentData]);

  useEffect(
    () =>
      onBackendEvent((event) => {
        if (
          event.event.sessionId === "__backend__" &&
          event.event.payload.lifecycle === "connected"
        ) {
          setBackendGeneration((generation) => generation + 1);
        }
      }),
    [],
  );

  useEffect(() => {
    if (browserDevelopmentData) {
      setSessionsHydrated(true);
      return;
    }

    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
        if (cancelled) {
          return;
        }

        const delayMs = retryDelaysMs[attempt] ?? 0;
        if (delayMs > 0) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, delayMs);
          });
        }

        if (cancelled) {
          return;
        }

        try {
          await refreshSessionProjections();
          return;
        } catch {
          // Keep prior list; retry. Never wipe to [] on transient errors.
        }
      }

      if (!cancelled) {
        setSessionsHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [backendGeneration, browserDevelopmentData, refreshSessionProjections]);

  const value = useMemo(
    () => ({
      sessionProjections,
      sessionsHydrated,
      backendGeneration,
      setSessionProjections,
      refreshSessionProjections,
    }),
    [
      backendGeneration,
      refreshSessionProjections,
      sessionProjections,
      sessionsHydrated,
    ],
  );

  return (
    <SessionProjectionsContext.Provider value={value}>
      {children}
    </SessionProjectionsContext.Provider>
  );
}

export function useSessionProjections() {
  const value = useContext(SessionProjectionsContext);

  if (!value) {
    throw new Error("useSessionProjections requires SessionProjectionsProvider");
  }

  return value;
}

/** Safe for tests / pages that may render AppFrame without the provider. */
export function useSessionProjectionsOptional(): SessionProjectionsContextValue | null {
  return useContext(SessionProjectionsContext);
}
