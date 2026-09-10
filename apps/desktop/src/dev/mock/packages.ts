import type {
  CatalogPackage,
  ConfigInventory,
  PackageInfo,
  ResourceInfo,
} from "@pace/core";
import snapshot from "./package-catalog.json";

// A registry snapshot and synthetic local inventory keep visual checks repeatable.
// This module is only imported by the dedicated dev:mock entry.
export function createMockPackages() {
  const catalog = snapshot as CatalogPackage[];
  const localPackage = (pkg: CatalogPackage): PackageInfo => {
    const source = pkg.source;
    const path = `/dev/pi-agent/npm/node_modules/${pkg.name}`;
    return {
      ...pkg,
      source,
      scope: "user",
      filtered: false,
      installedPath: path,
      resources: pkg.kinds.map((kind) => ({
        name: `${kind} entry`,
        kind,
        path: `${path}/${kind}/entry`,
        packageSource: source,
        origin: "package",
        scope: "user",
        enabled: kind !== "skill",
      })),
    };
  };
  let packages = catalog.slice(0, 3).map(localPackage);
  let updates = [packages[0].source];
  const dropIn: ResourceInfo = {
    name: "local-tools.ts",
    kind: "extension",
    path: "/dev/pi-agent/extensions/local-tools.ts",
    origin: "drop-in",
    scope: "user",
    enabled: true,
    lastError: {
      sessionId: "mock-session",
      timestamp: "2026-09-09T12:00:00Z",
      message: "Fixture: missing optional API key",
    },
  };
  return (command: string, args: Record<string, unknown>): unknown => {
    switch (command) {
      case "search_package_catalog": {
        const query = String(args.query ?? "").toLowerCase();
        const results = catalog.filter((pkg) =>
          `${pkg.name} ${pkg.description} ${pkg.author}`
            .toLowerCase()
            .includes(query),
        );
        const offset = Number(args.offset ?? 0);
        return {
          packages: results.slice(offset, offset + 6),
          total: results.length,
          nextOffset: offset + 6 < results.length ? offset + 6 : null,
        };
      }
      case "get_config_inventory": {
        const resources = [...packages.flatMap((pkg) => pkg.resources), dropIn];
        return {
          packages,
          extensions: resources.filter((r) => r.kind === "extension"),
          skills: resources.filter((r) => r.kind === "skill"),
          promptTemplates: resources.filter((r) => r.kind === "prompt"),
          themes: resources.filter((r) => r.kind === "theme"),
          defaultModel: "claude-sonnet-4-6",
          defaultProvider: "anthropic",
          defaultThinkingLevel: "medium",
          theme: "dark",
        } satisfies ConfigInventory;
      }
      case "check_package_updates":
        return {
          updates: updates.map((source) => ({
            source,
            scope: "user",
            type: "npm",
            displayName: source,
          })),
        };
      case "install_package": {
        const pkg = catalog.find((pkg) => pkg.source === args.source);
        if (!pkg)
          throw new Error(
            "Static mock only installs packages in its fixture catalogue.",
          );
        if (!packages.some((installed) => installed.source === pkg.source))
          packages.push(localPackage(pkg));
        break;
      }
      case "remove_package":
        packages = packages.filter((pkg) => pkg.source !== args.source);
        updates = updates.filter((source) => source !== args.source);
        break;
      case "update_package":
        updates = updates.filter((source) => source !== args.source);
        break;
      case "set_resource_enabled":
        packages = packages.map((pkg) => ({
          ...pkg,
          resources: pkg.resources.map((resource) =>
            resource.path === args.path
              ? { ...resource, enabled: args.enabled === true }
              : resource,
          ),
        }));
        break;
      default:
        throw new Error(`Static package mock does not execute ${command}`);
    }
    return {
      progress:
        command === "set_resource_enabled"
          ? []
          : [
              {
                type: "complete",
                action: "install",
                source: args.source,
                message: "Static mock completed",
              },
            ],
    };
  };
}
