import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeGatewaySnapshot, RuntimeGatewaySummary } from "@pigui/core";

export type PersistedSessionProjection = {
  sessionId: string;
  runtimeId: string;
  piSessionId: string;
  projectId: string;
  initialPrompt?: string;
  cwd: string;
  status: RuntimeGatewaySnapshot["status"] | "archived";
  sessionFile?: string;
  sessionFileMissing?: boolean;
  checkout?: unknown;
  summary?: RuntimeGatewaySummary;
  archivedAt?: string;
  updatedAt: string;
};

export type SessionProjectionStore = {
  save(projection: PersistedSessionProjection): Promise<void>;
  get(sessionId: string): Promise<PersistedSessionProjection | null>;
  list(): Promise<PersistedSessionProjection[]>;
};

export type FileSessionProjectionStoreOptions = {
  dataDir: string;
};

export type PiSessionListItem = {
  id: string;
  path: string;
};

export type RuntimeSnapshotWithProjectionFields = RuntimeGatewaySnapshot & {
  sessionFile?: string;
  checkout?: unknown;
};

function cloneProjection(
  projection: PersistedSessionProjection,
): PersistedSessionProjection {
  return {
    ...projection,
    summary: projection.summary ? { ...projection.summary } : undefined,
  };
}

function projectionFileName(sessionId: string) {
  return `${encodeURIComponent(sessionId)}.json`;
}

function projectionFilePath(dataDir: string, sessionId: string) {
  return join(dataDir, "projections", projectionFileName(sessionId));
}

function isProjection(value: unknown): value is PersistedSessionProjection {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { sessionId?: unknown }).sessionId === "string" &&
    typeof (value as { runtimeId?: unknown }).runtimeId === "string" &&
    typeof (value as { piSessionId?: unknown }).piSessionId === "string" &&
    typeof (value as { projectId?: unknown }).projectId === "string" &&
    typeof (value as { cwd?: unknown }).cwd === "string" &&
    typeof (value as { status?: unknown }).status === "string" &&
    typeof (value as { updatedAt?: unknown }).updatedAt === "string"
  );
}

export function projectionFromRuntimeSnapshot(
  snapshot: RuntimeSnapshotWithProjectionFields,
): PersistedSessionProjection {
  return {
    sessionId: snapshot.sessionId,
    runtimeId: snapshot.runtimeId,
    piSessionId: snapshot.piSessionId,
    projectId: snapshot.projectId,
    cwd: snapshot.cwd,
    status: snapshot.status,
    sessionFile: snapshot.sessionFile,
    checkout: snapshot.checkout,
    summary: snapshot.summary ? { ...snapshot.summary } : undefined,
    updatedAt: snapshot.updatedAt,
  };
}

function shouldPreserveTerminalStatus(
  current: PersistedSessionProjection,
  next: PersistedSessionProjection,
) {
  return (
    (current.status === "completed" || current.status === "failed") &&
    next.status === "idle"
  );
}

export function mergeSessionProjection(
  current: PersistedSessionProjection | null | undefined,
  next: PersistedSessionProjection,
): PersistedSessionProjection {
  if (!current) {
    return cloneProjection(next);
  }

  const merged: PersistedSessionProjection = {
    ...next,
    initialPrompt: next.initialPrompt ?? current.initialPrompt,
    status:
      current.status === "archived"
        ? "archived"
        : shouldPreserveTerminalStatus(current, next)
          ? current.status
          : next.status,
    sessionFile: next.sessionFile ?? current.sessionFile,
    checkout: next.checkout ?? current.checkout,
    summary: next.summary ?? current.summary,
    archivedAt: current.archivedAt ?? next.archivedAt,
  };

  if (merged.sessionFile) {
    delete merged.sessionFileMissing;
  } else if (current.sessionFileMissing || next.sessionFileMissing) {
    merged.sessionFileMissing = true;
  }

  return cloneProjection(merged);
}

export function createInMemorySessionProjectionStore(): SessionProjectionStore {
  const projections = new Map<string, PersistedSessionProjection>();

  return {
    async save(projection) {
      projections.set(projection.sessionId, cloneProjection(projection));
    },

    async get(sessionId) {
      const projection = projections.get(sessionId);

      return projection ? cloneProjection(projection) : null;
    },

    async list() {
      return Array.from(projections.values())
        .map(cloneProjection)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
  };
}

export function createFileSessionProjectionStore(
  options: FileSessionProjectionStoreOptions,
): SessionProjectionStore {
  const projectionsDir = join(options.dataDir, "projections");
  const cached = new Map<string, PersistedSessionProjection | null>();

  const readProjection = async (sessionId: string) => {
    if (cached.has(sessionId)) {
      const cachedProjection = cached.get(sessionId);

      return cachedProjection ? cloneProjection(cachedProjection) : null;
    }

    try {
      const parsed = JSON.parse(
        await readFile(projectionFilePath(options.dataDir, sessionId), "utf8"),
      ) as unknown;

      const projection = isProjection(parsed) ? cloneProjection(parsed) : null;

      cached.set(sessionId, projection ? cloneProjection(projection) : null);

      return projection;
    } catch {
      cached.set(sessionId, null);

      return null;
    }
  };

  return {
    async save(projection) {
      await mkdir(projectionsDir, { recursive: true });
      cached.set(projection.sessionId, cloneProjection(projection));
      await writeFile(
        projectionFilePath(options.dataDir, projection.sessionId),
        `${JSON.stringify(projection, null, 2)}\n`,
        "utf8",
      );
    },

    async get(sessionId) {
      return readProjection(sessionId);
    },

    async list() {
      try {
        const fileNames = await readdir(projectionsDir);
        const projections = await Promise.all(
          fileNames
            .filter((fileName) => fileName.endsWith(".json"))
            .map(async (fileName) => {
              const sessionId = decodeURIComponent(fileName.slice(0, -5));

              return readProjection(sessionId);
            }),
        );

        return projections
          .filter((projection): projection is PersistedSessionProjection =>
            Boolean(projection),
          )
          .map(cloneProjection)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      } catch {
        return [];
      }
    },
  };
}

export function repairProjectionSessionFiles(
  projections: PersistedSessionProjection[],
  piSessions: PiSessionListItem[],
) {
  const pathsByPiSessionId = new Map(
    piSessions.map((session) => [session.id, session.path]),
  );

  return projections.map((projection) => {
    if (projection.sessionFile) {
      return projection;
    }

    const repairedPath = pathsByPiSessionId.get(projection.piSessionId);

    return repairedPath
      ? {
          ...projection,
          sessionFile: repairedPath,
          sessionFileMissing: undefined,
        }
      : {
          ...projection,
          sessionFileMissing: true,
        };
  });
}
