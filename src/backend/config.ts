import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConfigInventory, ExtensionInfo, SkillInfo } from "../setup";

type JsonRecord = Record<string, unknown>;

export async function buildConfigInventory(dir: string): Promise<ConfigInventory> {
  const settings = await readSettings(dir);
  const extensions = await buildExtensions(settings, dir);
  const skills: SkillInfo[] = (await listNamedEntries(join(dir, "skills"))).map((name) => ({
    name,
    source: "directory",
  }));

  return {
    defaultModel: stringSetting(settings, ["defaultModel", "default_model", "model", "currentModel"]),
    defaultProvider: stringSetting(settings, ["defaultProvider", "default_provider", "provider"]),
    defaultThinkingLevel: stringSetting(settings, [
      "defaultThinkingLevel",
      "default_thinking_level",
      "thinkingLevel",
    ]),
    theme: stringSetting(settings, ["theme"]),
    packages: namedArray(settings, "packages"),
    extensions,
    skills,
    promptTemplates: [],
  };
}

async function readSettings(dir: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(dir, "settings.json"), "utf8")) as unknown;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function stringSetting(settings: unknown, keys: string[]) {
  if (!isRecord(settings)) {
    return undefined;
  }

  for (const key of keys) {
    const value = settings[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function namedArray(settings: unknown, key: string) {
  if (!isRecord(settings) || !Array.isArray(settings[key])) {
    return [];
  }

  return Array.from(new Set(settings[key].map(namedValue).filter(isString))).sort((left, right) =>
    left.localeCompare(right),
  );
}

function namedValue(value: unknown) {
  if (typeof value === "string") {
    return nonEmpty(value);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ["name", "id", "package", "path"]) {
    const named = nonEmpty(value[key]);
    if (named) {
      return named;
    }
  }

  return undefined;
}

async function buildExtensions(settings: unknown, dir: string) {
  const extensions = new Map<string, ExtensionInfo>();

  if (isRecord(settings) && Array.isArray(settings.extensions)) {
    for (const item of settings.extensions) {
      const extension = extensionFromSetting(item);
      if (extension) {
        extensions.set(extension.name, extension);
      }
    }
  }

  for (const name of await listNamedEntries(join(dir, "extensions"))) {
    const existing = extensions.get(name);
    if (existing) {
      extensions.set(name, {
        ...existing,
        source: "settings,directory",
      });
    } else {
      extensions.set(name, {
        name,
        source: "directory",
        enabled: true,
      });
    }
  }

  return Array.from(extensions.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function extensionFromSetting(value: unknown): ExtensionInfo | undefined {
  if (typeof value === "string") {
    const name = nonEmpty(value);
    return name ? { name, source: "settings", enabled: true } : undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const name = nonEmpty(value.name) ?? nonEmpty(value.id);
  if (!name) {
    return undefined;
  }

  return {
    name,
    source: "settings",
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
  };
}

async function listNamedEntries(dir: string) {
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return Array.from(new Set(
    entries
      .map((entry) => nonEmpty(entry.name))
      .filter(isString)
      .filter((name) => !name.startsWith(".")),
  )).sort((left, right) => left.localeCompare(right));
}

function nonEmpty(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
