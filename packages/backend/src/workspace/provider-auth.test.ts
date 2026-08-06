import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { createProviderAuthService } from "./provider-auth";

async function tempAgentDir() {
  return mkdtemp(join(tmpdir(), "pigui-provider-auth-"));
}

describe("provider auth service", () => {
  it("lists catalog providers with none configured", async () => {
    const agentDir = await tempAgentDir();
    const service = createProviderAuthService({ agentDir });

    const report = service.listStatus();

    expect(report.configuredCount).toBe(0);
    expect(report.providers.map((provider) => provider.id)).toEqual([
      "openai",
      "anthropic",
      "deepseek",
      "xai",
    ]);
    expect(report.providers.every((provider) => provider.mode === "none")).toBe(true);
  });

  it("sets an API key and returns a masked hint without the full secret", async () => {
    const agentDir = await tempAgentDir();
    const service = createProviderAuthService({ agentDir });

    const report = service.setApiKey("deepseek", "sk-secret-key-ae1d");

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
    await writeFile(
      join(agentDir, "auth.json"),
      JSON.stringify({ openai: { type: "api_key", key: "sk-openai-1234" } }),
      "utf8",
    );
    const service = createProviderAuthService({
      agentDir,
      authStorage: AuthStorage.create(join(agentDir, "auth.json")),
    });

    const report = service.remove("openai");

    expect(report.configuredCount).toBe(0);
    expect(report.providers.find((provider) => provider.id === "openai")?.mode).toBe("none");
  });

  it("rejects empty API keys", async () => {
    const agentDir = await tempAgentDir();
    const service = createProviderAuthService({ agentDir });

    expect(() => service.setApiKey("openai", "   ")).toThrow(/empty/i);
  });
});
