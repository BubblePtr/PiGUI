import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProviderAuthService,
  type ProviderAuthRuntime,
} from "./provider-auth";

async function tempAgentDir() {
  return mkdtemp(join(tmpdir(), "pigui-provider-auth-"));
}

describe("provider auth service", () => {
  it("lists catalog providers with none configured", async () => {
    const agentDir = await tempAgentDir();
    const service = createProviderAuthService({ agentDir });

    const report = await service.listStatus();

    expect(report.configuredCount).toBe(0);
    expect(report.providers.map((provider) => provider.id)).toEqual([
      "openai",
      "openai-codex",
      "anthropic",
      "deepseek",
      "xai",
    ]);
    expect(report.providers.every((provider) => provider.mode === "none")).toBe(true);
  });

  it("reuses openai-codex OAuth already stored in Pi auth.json", async () => {
    const agentDir = await tempAgentDir();
    await writeFile(
      join(agentDir, "auth.json"),
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "sk-codex-access-ae1d",
          refresh: "refresh-token",
          expires: Date.now() + 60_000,
          accountId: "acct_1",
        },
      }),
      "utf8",
    );
    const service = createProviderAuthService({ agentDir });

    const report = await service.listStatus();
    const codex = report.providers.find((provider) => provider.id === "openai-codex");

    expect(codex).toMatchObject({
      mode: "oauth",
      configured: true,
      supportsOAuth: true,
      supportsApiKey: false,
      keyHint: "…ae1d",
    });
    expect(report.configuredCount).toBe(1);
    expect(JSON.stringify(report)).not.toContain("sk-codex-access-ae1d");
  });

  it("sets an API key and returns a masked hint without the full secret", async () => {
    const agentDir = await tempAgentDir();
    const service = createProviderAuthService({ agentDir });

    const report = await service.setApiKey("deepseek", "sk-secret-key-ae1d");

    const deepseek = report.providers.find((provider) => provider.id === "deepseek");
    expect(deepseek).toMatchObject({
      mode: "api_key",
      configured: true,
      keyHint: "…ae1d",
    });
    expect(JSON.stringify(report)).not.toContain("sk-secret-key-ae1d");

    const onDisk = JSON.parse(await readFile(join(agentDir, "auth.json"), "utf8")) as {
      deepseek: { type: string; key: string };
    };
    expect(onDisk.deepseek).toEqual({ type: "api_key", key: "sk-secret-key-ae1d" });
  });

  it("removes a provider credential", async () => {
    const agentDir = await tempAgentDir();
    const service = createProviderAuthService({ agentDir });
    await service.setApiKey("openai", "sk-openai-1234");

    const report = await service.remove("openai");

    expect(report.configuredCount).toBe(0);
    expect(report.providers.find((provider) => provider.id === "openai")?.mode).toBe(
      "none",
    );
  });

  it("rejects empty API keys", async () => {
    const agentDir = await tempAgentDir();
    const service = createProviderAuthService({ agentDir });

    await expect(service.setApiKey("openai", "   ")).rejects.toThrow(/empty/i);
  });

  it("defaults Codex subscription login to the browser OAuth method", async () => {
    const agentDir = await tempAgentDir();
    let selected: string | undefined;
    const runtime: ProviderAuthRuntime = {
      getProviderAuthStatus: () => ({ configured: false }),
      async login(_providerId, _type, interaction) {
        selected = await interaction.prompt({
          type: "select",
          message: "Select OpenAI Codex login method:",
          options: [
            { id: "browser", label: "Browser login (default)" },
            { id: "device_code", label: "Device code login (headless)" },
          ],
        });
        return { type: "oauth", access: "a", refresh: "r", expires: 0 };
      },
      async logout() {},
      async refresh() {
        return { aborted: false, errors: new Map() };
      },
    };
    const service = createProviderAuthService({
      agentDir,
      createRuntime: async () => runtime,
    });

    await service.loginOAuth("openai-codex");

    expect(selected).toBe("browser");
  });
});
