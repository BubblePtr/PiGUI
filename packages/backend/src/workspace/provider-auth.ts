// Provider auth service — list/set/remove API keys and OAuth login/logout
// through Pi AuthStorage (same auth.json as preflight and runtime).

import { join } from "node:path";
import { spawn } from "node:child_process";
import { AuthStorage } from "@earendil-works/pi-coding-agent";
import {
  PROVIDER_AUTH_CATALOG,
  type ProviderAuthId,
  type ProviderAuthMode,
  type ProviderAuthStatusItem,
  type ProviderAuthStatusReport,
} from "@pigui/core";

export type ProviderAuthService = {
  listStatus(): ProviderAuthStatusReport;
  setApiKey(providerId: ProviderAuthId, apiKey: string): ProviderAuthStatusReport;
  remove(providerId: ProviderAuthId): ProviderAuthStatusReport;
  loginOAuth(providerId: ProviderAuthId): Promise<ProviderAuthStatusReport>;
  logout(providerId: ProviderAuthId): ProviderAuthStatusReport;
};

export type ProviderAuthServiceOptions = {
  agentDir: string;
  /** Override AuthStorage for tests. */
  authStorage?: AuthStorage;
  openExternalUrl?: (url: string) => void | Promise<void>;
};

function authPathFor(agentDir: string) {
  return join(agentDir, "auth.json");
}

function maskKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) {
    return "••••";
  }

  return `…${trimmed.slice(-4)}`;
}

function openUrlDefault(url: string) {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function modeFromCredential(
  credential: ReturnType<AuthStorage["get"]>,
): ProviderAuthMode {
  if (!credential) {
    return "none";
  }

  if (credential.type === "api_key") {
    return "api_key";
  }

  if (credential.type === "oauth") {
    return "oauth";
  }

  return "none";
}

function keyHintFromCredential(
  credential: ReturnType<AuthStorage["get"]>,
): string | undefined {
  if (!credential) {
    return undefined;
  }

  if (credential.type === "api_key" && typeof credential.key === "string") {
    return maskKey(credential.key);
  }

  if (credential.type === "oauth") {
    const access = typeof credential.access === "string" ? credential.access : "";
    if (access) {
      return maskKey(access);
    }
  }

  return undefined;
}

function assertKnownProvider(providerId: string): asserts providerId is ProviderAuthId {
  if (!PROVIDER_AUTH_CATALOG.some((entry) => entry.id === providerId)) {
    throw new Error(`Unknown provider "${providerId}".`);
  }
}

export function createProviderAuthService(
  options: ProviderAuthServiceOptions,
): ProviderAuthService {
  const authPath = authPathFor(options.agentDir);
  const storage = options.authStorage ?? AuthStorage.create(authPath);
  const openExternal = options.openExternalUrl ?? openUrlDefault;

  const listStatus = (): ProviderAuthStatusReport => {
    storage.reload();

    const providers: ProviderAuthStatusItem[] = PROVIDER_AUTH_CATALOG.map((entry) => {
      const credential = storage.get(entry.id);
      const mode = modeFromCredential(credential);
      const status = storage.getAuthStatus(entry.id);
      const keyHint = keyHintFromCredential(credential);

      return {
        id: entry.id,
        label: entry.label,
        supportsApiKey: entry.supportsApiKey,
        supportsOAuth: entry.supportsOAuth,
        mode,
        configured: mode !== "none" || status.configured,
        ...(keyHint ? { keyHint } : {}),
        ...(status.label ? { statusLabel: status.label } : {}),
      };
    });

    return {
      agentDir: options.agentDir,
      authPath,
      providers,
      configuredCount: providers.filter((provider) => provider.configured).length,
    };
  };

  return {
    listStatus,

    setApiKey(providerId, apiKey) {
      assertKnownProvider(providerId);
      const entry = PROVIDER_AUTH_CATALOG.find((item) => item.id === providerId)!;

      if (!entry.supportsApiKey) {
        throw new Error(`Provider "${providerId}" does not support API keys.`);
      }

      const trimmed = apiKey.trim();
      if (!trimmed) {
        throw new Error("API key must not be empty.");
      }

      storage.reload();
      storage.set(providerId, { type: "api_key", key: trimmed });
      return listStatus();
    },

    remove(providerId) {
      assertKnownProvider(providerId);
      storage.reload();
      storage.remove(providerId);
      return listStatus();
    },

    async loginOAuth(providerId) {
      assertKnownProvider(providerId);
      const entry = PROVIDER_AUTH_CATALOG.find((item) => item.id === providerId)!;

      if (!entry.supportsOAuth) {
        throw new Error(`Provider "${providerId}" does not support subscription login.`);
      }

      storage.reload();

      await storage.login(providerId, {
        onAuth: (info) => {
          void openExternal(info.url);
        },
        onDeviceCode: (info) => {
          void openExternal(info.verificationUri);
        },
        onPrompt: async (prompt) => {
          throw new Error(
            `Provider "${providerId}" login requires interactive input (${prompt.message}). Complete this login in the Pi TUI for now, or use an API key.`,
          );
        },
        onSelect: async () => {
          throw new Error(
            `Provider "${providerId}" login requires an interactive selection. Complete this login in the Pi TUI for now, or use an API key.`,
          );
        },
        onProgress: () => {},
      });

      return listStatus();
    },

    logout(providerId) {
      assertKnownProvider(providerId);
      storage.reload();
      storage.logout(providerId);
      return listStatus();
    },
  };
}
