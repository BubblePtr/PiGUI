import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { DefaultPackageManager, loadSkills, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ConfigInventory } from "@pigui/core";

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
  const skillResources = resources.skills.filter(resource => resource.enabled);
  const skills = loadSkills({
    cwd: agentDir,
    agentDir,
    skillPaths: skillResources.map(resource => resource.path),
    includeDefaults: false,
  }).skills;
  const source = (metadata: { scope: string; source: string }) => `${metadata.scope}:${metadata.source}`;

  return {
    defaultModel: settingsManager.getDefaultModel(),
    defaultProvider: settingsManager.getDefaultProvider(),
    defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
    theme: settingsManager.getTheme(),
    packages: [...new Set((settingsManager.getGlobalSettings().packages ?? [])
      .map(pkg => typeof pkg === "string" ? pkg : pkg.source))].sort(),
    extensions: resources.extensions.map(resource => ({
      name: resource.metadata.origin === "package"
        ? `${resource.metadata.source}/${relative(resource.metadata.baseDir ?? agentDir, resource.path)}`
        : relative(agentDir, resource.path),
      source: source(resource.metadata),
      enabled: resource.enabled,
    })).sort((left, right) => left.name.localeCompare(right.name)),
    skills: skills.map(skill => ({
      name: skill.name,
      source: source(skillResources.find(resource => resource.path === skill.filePath)?.metadata ?? { scope: "user", source: "local" }),
    })).sort((left, right) => left.name.localeCompare(right.name)),
    promptTemplates: [],
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
