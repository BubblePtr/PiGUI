// Provider auth contracts for PiGUI Settings (DF-002 / S3).
// Credentials live in Pi's auth.json via AuthStorage; this package only
// defines the IPC-facing status shape (never raw secrets).

export type ProviderAuthId = "openai" | "anthropic" | "deepseek" | "xai";

export type ProviderAuthMode = "none" | "api_key" | "oauth";

export type ProviderAuthStatusItem = {
  id: ProviderAuthId;
  label: string;
  supportsApiKey: boolean;
  supportsOAuth: boolean;
  mode: ProviderAuthMode;
  configured: boolean;
  /** Masked hint only, e.g. "…ae1d". Never a full key. */
  keyHint?: string;
  statusLabel?: string;
};

export type ProviderAuthStatusReport = {
  agentDir: string;
  authPath: string;
  providers: ProviderAuthStatusItem[];
  configuredCount: number;
};

export const PROVIDER_AUTH_CATALOG: ReadonlyArray<{
  id: ProviderAuthId;
  label: string;
  supportsApiKey: boolean;
  supportsOAuth: boolean;
}> = [
  { id: "openai", label: "OpenAI", supportsApiKey: true, supportsOAuth: true },
  {
    id: "anthropic",
    label: "Anthropic",
    supportsApiKey: true,
    supportsOAuth: true,
  },
  { id: "deepseek", label: "DeepSeek", supportsApiKey: true, supportsOAuth: false },
  { id: "xai", label: "Grok (xAI)", supportsApiKey: true, supportsOAuth: false },
] as const;
