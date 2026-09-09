import { basename, dirname, relative, resolve } from "node:path";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import type {
  CheckPackageUpdatesResult,
  PackageActionResult,
  PackageProgressEvent,
  PackageSourceInput,
  RemovePackageResult,
  SetResourceEnabledInput,
  UpdatePackageInput,
} from "@pace/core";

function assertSettingsHealthy(settings: SettingsManager) {
  const errors = settings.drainErrors();
  if (errors.length) {
    throw new Error(errors.map(({ scope, path, error }) => `${path ?? scope}: ${error.message}`).join("\n"));
  }
}

const pendingActions = new Map<string, Promise<unknown>>();

async function withPackages<T>(dir: string, action: (manager: DefaultPackageManager, settings: SettingsManager) => Promise<T>) {
  const agentDir = resolve(dir);
  // SDK locks protect each write, but packages is a whole-array snapshot. Serialize
  // Pace actions so a second request reads the first request's completed write.
  const previous = pendingActions.get(agentDir);
  const operation = (previous ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const settings = SettingsManager.create(agentDir, agentDir, { projectTrusted: false });
    assertSettingsHealthy(settings);
    const manager = new DefaultPackageManager({ cwd: agentDir, agentDir, settingsManager: settings });
    const progress: PackageProgressEvent[] = [];
    manager.setProgressCallback(event => progress.push({ ...event }));
    try {
      const result = await action(manager, settings);
      return { ...result, progress };
    } finally {
      // SDK setters enqueue locked writes; completion must mean the CLI can read them.
      await settings.flush();
      assertSettingsHealthy(settings);
    }
  });
  pendingActions.set(agentDir, operation);
  try {
    return await operation;
  } finally {
    if (pendingActions.get(agentDir) === operation) pendingActions.delete(agentDir);
  }
}

export async function setResourceEnabled(dir: string, input: SetResourceEnabledInput): Promise<PackageActionResult> {
  if (input.kind === "theme") throw new Error("Theme resources only affect the Pi terminal and cannot be toggled");
  const packageSource = input.packageSource;
  if (!packageSource || packageSource === "auto") throw new Error("Drop-in and top-level resources have no package filter; remove the resource file instead");
  if (!["extension", "skill", "prompt"].includes(input.kind)) throw new Error("Unknown resource kind");
  if (typeof input.enabled !== "boolean") throw new Error("enabled must be a boolean");
  return withPackages(dir, async (manager, settings) => {
    const key = { extension: "extensions", skill: "skills", prompt: "prompts", theme: "themes" } as const;
    const resources = await manager.resolve(async () => "skip");
    const resource = resources[key[input.kind]].find(entry =>
      entry.path === input.path && entry.metadata.source === packageSource &&
      entry.metadata.scope === "user" && entry.metadata.origin === "package");
    if (!resource) throw new Error("Resource was not found in the configured package");
    if (resource.path === manager.getInstalledPath(packageSource, "user")) {
      throw new Error("Pi ignores Resource Filter toggles for local file or bare-directory packages. Remove the registration or move the resource into a convention directory.");
    }
    const packages = settings.getGlobalSettings().packages ?? [];
    const index = packages.findIndex(pkg => (typeof pkg === "string" ? pkg : pkg.source) === packageSource);
    if (index < 0 || !resource.metadata.baseDir) throw new Error("Resource has no configured user package");
    const current = packages[index];
    const pkg = typeof current === "string" ? { source: current } : { ...current };
    const field = key[input.kind];
    const baseDir = resource.metadata.baseDir;
    const path = relative(baseDir, resource.path);
    const existing = pkg[field];
    // An empty native filter disables the whole kind; retain that baseline.
    const baseline = existing?.length === 0 && pkg.autoload !== false ? ["!**/*"] : existing ?? [];
    const patterns = baseline.filter(pattern => {
      if (!pattern.startsWith("+") && !pattern.startsWith("-")) return true;
      const target = resolve(baseDir, pattern.slice(1));
      return target !== resource.path && !(input.kind === "skill" && basename(resource.path) === "SKILL.md" && target === dirname(resource.path));
    });
    // Exact overrides survive broad exclusions and treat glob characters in filenames literally.
    patterns.push(`${input.enabled ? "+" : "-"}${path}`);
    pkg[field] = patterns;
    packages[index] = pkg;
    settings.setPackages(packages);
    return {};
  });
}

export async function installPackage(dir: string, input: PackageSourceInput): Promise<PackageActionResult> {
  if (!/^(npm:|git:|https:\/\/)/.test(input.source)) {
    throw new Error("Install accepts npm:, git:, or https:// sources. Use Add local resource for local files.");
  }
  return withPackages(dir, async manager => {
    await manager.installAndPersist(input.source);
    return {};
  });
}

export async function removePackage(dir: string, input: PackageSourceInput): Promise<RemovePackageResult> {
  return withPackages(dir, async manager => ({ removed: await manager.removeAndPersist(input.source) }));
}

export async function updatePackage(dir: string, input: UpdatePackageInput = {}): Promise<PackageActionResult> {
  return withPackages(dir, async manager => {
    await manager.update(input.source);
    return {};
  });
}

export async function checkPackageUpdates(dir: string): Promise<CheckPackageUpdatesResult> {
  return withPackages(dir, async manager => ({ updates: await manager.checkForAvailableUpdates() }));
}
