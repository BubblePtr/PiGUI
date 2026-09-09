import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { DefaultPackageManager, loadSkills, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ConfigInventory, ResourceInfo } from "@pace/core";

export async function buildConfigInventory(dir: string): Promise<ConfigInventory> {
  const agentDir = resolve(dir);
  const settings = await readSettings(agentDir);
  // Setup is the global inventory. Do not accidentally read the backend's cwd
  // as a project, or let a read-only query persist Pi settings migrations.
  const settingsManager = SettingsManager.inMemory(settings, { projectTrusted: false });
  const packages = new DefaultPackageManager({ cwd: agentDir, agentDir, settingsManager });
  // Resolve native manifests and filters without installing missing packages
  // or evaluating extension modules just to display configuration.
  const resources = await packages.resolve(async () => "skip");
  const mapResources = (entries: typeof resources.extensions, kind: ResourceInfo["kind"]): ResourceInfo[] =>
    entries.map((resource): ResourceInfo => {
      // Load metadata per path so duplicate skill names and disabled skills remain visible.
      const skill = kind === "skill" ? loadSkills({
        cwd: agentDir,
        agentDir,
        skillPaths: [resource.path],
        includeDefaults: false,
      }).skills[0] : undefined;
      return {
        kind,
        name: skill?.name ?? relative(resource.metadata.baseDir ?? agentDir, resource.path),
        description: skill?.description,
        path: resource.path,
        enabled: resource.enabled,
        origin: resource.metadata.source === "auto" ? "drop-in" : resource.metadata.origin,
        scope: resource.metadata.scope === "project" ? "project" : "user",
        packageSource: resource.metadata.origin === "package" ? resource.metadata.source : undefined,
      };
    }).sort((left, right) => left.name.localeCompare(right.name));
  const extensions = mapResources(resources.extensions, "extension");
  const skills = mapResources(resources.skills, "skill");
  const promptTemplates = mapResources(resources.prompts, "prompt");
  const themes = mapResources(resources.themes, "theme");
  const allResources = [...extensions, ...skills, ...promptTemplates, ...themes];

  return {
    defaultModel: settingsManager.getDefaultModel(),
    defaultProvider: settingsManager.getDefaultProvider(),
    defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
    theme: settingsManager.getTheme(),
    packages: packages.listConfiguredPackages().map(pkg => ({
      ...pkg,
      resources: allResources.filter(resource => resource.packageSource === pkg.source && resource.scope === pkg.scope),
    })).sort((left, right) => left.source.localeCompare(right.source)),
    extensions,
    skills,
    promptTemplates,
    themes,
  };
}

async function readSettings(dir: string): Promise<Parameters<typeof SettingsManager.inMemory>[0]> {
  try {
    const settings: unknown = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    return typeof settings === "object" && settings !== null && !Array.isArray(settings) ? settings : {};
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}
