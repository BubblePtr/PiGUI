import type { ConfigInventory, ResourceInfo } from "@pace/core";
import type { SessionEventJournal } from "../persistence/session-event-journal";
import type { SessionProjectionStore } from "../persistence/session-projection-store";

export async function addResourceDiagnostics(
  inventory: ConfigInventory,
  store: SessionProjectionStore,
  journal: SessionEventJournal,
): Promise<ConfigInventory> {
  const latest = (await store.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!latest) return inventory;
  const errors = (await journal.read(latest.piSessionId))
    .filter(event => event.payload.type === "error" &&
      (event.payload.code === "extension_load_error" || event.payload.code === "extension_error") &&
      typeof event.payload.body === "string")
    .sort((a, b) => b.ts.localeCompare(a.ts));
  const diagnose = (resource: ResourceInfo): ResourceInfo => {
    if (resource.kind !== "extension") return resource;
    const error = errors.find(event => {
      const body = event.payload.body as string;
      // ADR-0031 journals "path: detail"; require a path boundary, never a substring in a stack trace.
      const path = body.slice(0, body.indexOf(": "));
      return path === resource.path || path.startsWith(`${resource.path}/`);
    });
    return { ...resource, lastError: error ? {
      sessionId: latest.sessionId, timestamp: error.ts, message: error.payload.body as string,
    } : undefined };
  };
  return {
    ...inventory,
    extensions: inventory.extensions.map(diagnose),
    packages: inventory.packages.map(pkg => ({ ...pkg, resources: pkg.resources.map(diagnose) })),
  };
}
