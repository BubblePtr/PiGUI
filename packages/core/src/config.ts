// Config inventory contracts — produced by the utilityProcess config reader,
// rendered by the renderer's setup view.

export type ConfigInventory = {
  defaultModel?: string;
  defaultProvider?: string;
  defaultThinkingLevel?: string;
  theme?: string;
  packages: string[];
  extensions: ExtensionInfo[];
  skills: SkillInfo[];
  promptTemplates: TemplateInfo[];
};

export type ExtensionInfo = {
  name: string;
  source: string;
  enabled: boolean;
};

export type SkillInfo = {
  name: string;
  description?: string;
  source: string;
};

export type TemplateInfo = {
  name: string;
};
