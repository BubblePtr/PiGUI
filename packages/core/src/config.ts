// Config inventory contracts — produced by the utilityProcess config reader,
// rendered by the renderer's setup view.

export type ResourceInfo = {
  kind: "extension" | "skill" | "prompt" | "theme";
  name: string;
  description?: string;
  path: string;
  enabled: boolean;
  origin: "package" | "top-level" | "drop-in";
  scope: "user" | "project";
  packageSource?: string;
  lastError?: { sessionId: string; timestamp: string; message: string };
};

export type PackageInfo = {
  source: string;
  scope: "user" | "project";
  filtered: boolean;
  installedPath?: string;
  resources: ResourceInfo[];
};

export type ConfigInventory = {
  defaultModel?: string;
  defaultProvider?: string;
  defaultThinkingLevel?: string;
  theme?: string;
  packages: PackageInfo[];
  extensions: ResourceInfo[];
  skills: ResourceInfo[];
  promptTemplates: ResourceInfo[];
  themes: ResourceInfo[];
};
