import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DefaultPackageManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { buildConfigInventory } from "./config";

const roots: string[] = [];
async function fixture(settings: object = {}) {
  const root = await mkdtemp(join(tmpdir(), "pigui-config-"));
  roots.push(root);
  vi.stubEnv("HOME", root);
  const agentDir = join(root, "agent");
  await mkdir(agentDir);
  const put = async (path: string, content: string) => {
    await mkdir(join(agentDir, path, ".."), { recursive: true });
    await writeFile(join(agentDir, path), content);
  };
  await put("settings.json", JSON.stringify(settings));
  return { agentDir, put };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("backend native config inventory", () => {
  it("preserves native package sources and package filters without executing extensions", async () => {
    const { agentDir, put } = await fixture({
      defaultModel: "gpt-5-codex",
      packages: [{ source: "./local-package", extensions: ["!extensions/disabled.ts"] }],
    });
    await put("local-package/package.json", JSON.stringify({ pi: { extensions: ["extensions/*.ts"] } }));
    await put("local-package/extensions/enabled.ts", 'throw new Error("Inventory must never execute extensions");');
    await put("local-package/extensions/disabled.ts", 'export default function() {}');
    await put("auth.json", '{"openai":{"key":"sk-test-secret"}}');
    const before = await readFile(join(agentDir, "settings.json"), "utf8");
    const inventory = await buildConfigInventory(agentDir);
    expect(inventory.defaultModel).toBe("gpt-5-codex");
    expect(inventory.packages).toEqual([expect.objectContaining({ source: "./local-package", scope: "user", filtered: true, installedPath: join(agentDir, "local-package"), resources: inventory.extensions })]);
    expect(inventory.extensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringContaining("enabled.ts"), enabled: true, origin: "package", packageSource: "./local-package", kind: "extension", scope: "user" }),
      expect.objectContaining({ name: expect.stringContaining("disabled.ts"), enabled: false }),
    ]));
    expect(JSON.stringify(inventory)).not.toContain("sk-test-secret");
    expect(await readFile(join(agentDir, "settings.json"), "utf8")).toBe(before);
  });

  it("distinguishes explicit top-level resources from the Pi auto-discovery contract", async () => {
    const settings = { extensions: ["./custom/explicit.ts"] };
    const { agentDir, put } = await fixture(settings);
    await put("custom/explicit.ts", "export default function() {}");
    await put("extensions/drop.ts", "export default function() {}");
    const manager = new DefaultPackageManager({ cwd: agentDir, agentDir, settingsManager: SettingsManager.inMemory(settings, { projectTrusted: false }) });
    const resolved = await manager.resolve(async () => "skip");
    // Pace relies on these SDK metadata values to distinguish conventional directories.
    expect(resolved.extensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: join(agentDir, "extensions/drop.ts"), metadata: expect.objectContaining({ origin: "top-level", source: "auto" }) }),
      expect.objectContaining({ path: join(agentDir, "custom/explicit.ts"), metadata: expect.objectContaining({ origin: "top-level", source: "local" }) }),
    ]));
    const inventory = await buildConfigInventory(agentDir);
    expect(inventory.extensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: join(agentDir, "extensions/drop.ts"), origin: "drop-in", packageSource: undefined }),
      expect.objectContaining({ path: join(agentDir, "custom/explicit.ts"), origin: "top-level", packageSource: undefined }),
    ]));
  });

  it("applies native exclusions to auto-discovered extensions and ignores non-entry files", async () => {
    const { agentDir, put } = await fixture({ extensions: ["-extensions/disabled.ts"] });
    await put("extensions/enabled.ts", "export default function() {}");
    await put("extensions/disabled.ts", "export default function() {}");
    await put("extensions/README.md", "Not an extension");
    const inventory = await buildConfigInventory(agentDir);
    expect(inventory.extensions).toHaveLength(2);
    expect(inventory.extensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringContaining("disabled.ts"), enabled: false }),
      expect.objectContaining({ name: expect.stringContaining("enabled.ts"), enabled: true }),
    ]));
    expect(inventory.extensions.some(entry => entry.name.startsWith("-"))).toBe(false);
  });

  it("retains disabled native skills for inventory alongside enabled package skills", async () => {
    const { agentDir, put } = await fixture({
      packages: [{ source: "./local-package", extensions: [] }],
      skills: ["-skills/disabled"],
    });
    await put("skills/enabled/SKILL.md", "---\nname: enabled\ndescription: Test\n---\nUse this skill.");
    await put("skills/disabled/SKILL.md", "---\nname: disabled\ndescription: Test\n---\nDisabled.");
    await put("skills/not-a-skill/README.md", "Not a skill");
    await put("local-package/package.json", JSON.stringify({ pi: { skills: ["skills"] } }));
    await put("local-package/skills/packaged/SKILL.md", "---\nname: packaged\ndescription: Test\n---\nPackaged.");
    const inventory = await buildConfigInventory(agentDir);
    expect(inventory.skills.map(skill => skill.name).sort()).toEqual(["disabled", "enabled", "packaged"]);
    expect(inventory.skills[0]).toMatchObject({ description: "Test", enabled: false, origin: "drop-in", kind: "skill" });
  });

  it("expands all four resource kinds and preserves package filters", async () => {
    const { agentDir, put } = await fixture({ packages: [{ source: "./kit", skills: [], prompts: [], themes: [] }] });
    await put("kit/package.json", JSON.stringify({ pi: { extensions: ["tool.ts"], skills: ["skills"], prompts: ["prompts"], themes: ["themes"] } }));
    await put("kit/tool.ts", 'throw new Error("must not execute");');
    await put("kit/skills/review/SKILL.md", "---\nname: review\ndescription: Review changes\n---\nReview.");
    await put("kit/prompts/plan.md", "Plan the work.");
    await put("kit/themes/night.json", "{}");
    const inventory = await buildConfigInventory(agentDir);
    expect(inventory.packages[0].resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "extension", enabled: true }),
      expect.objectContaining({ kind: "skill", name: "review", enabled: false, description: "Review changes" }),
      expect.objectContaining({ kind: "prompt", path: join(agentDir, "kit/prompts/plan.md"), enabled: false }),
      expect.objectContaining({ kind: "theme", path: join(agentDir, "kit/themes/night.json"), enabled: false }),
    ]));
    expect(inventory.promptTemplates).toHaveLength(1);
    expect(inventory.themes).toHaveLength(1);
    for (const resource of inventory.packages[0].resources) {
      expect(resource).toMatchObject({ origin: "package", scope: "user", packageSource: "./kit" });
    }
  });

  it("keeps missing packages visible without installing them", async () => {
    const { agentDir } = await fixture({ packages: [{ source: "npm:pigui-inventory-not-installed@0.0.0" }] });
    const inventory = await buildConfigInventory(agentDir);
    expect(inventory.packages).toEqual([expect.objectContaining({ source: "npm:pigui-inventory-not-installed@0.0.0", resources: [] })]);
    expect(inventory.extensions).toEqual([]);
    await expect(access(join(agentDir, "npm"))).rejects.toThrow();
  });

  it("allows missing settings and inventory directories", async () => {
    const { agentDir } = await fixture();
    await rm(join(agentDir, "settings.json"));
    await expect(buildConfigInventory(agentDir)).resolves.toEqual({ packages: [], extensions: [], skills: [], promptTemplates: [], themes: [] });
  });
});

it("reads installed metadata locally and keeps packages with a damaged manifest manageable", async () => {
  const { agentDir, put } = await fixture({ packages: ["./kit", "./broken"] });
  await put("kit/package.json", JSON.stringify({ name: "pi-review", version: "1.2.0", description: "Review changes", author: { name: "Dev" }, pi: { extensions: ["tool.ts"] } }));
  await put("kit/tool.ts", 'throw new Error("must not execute");');
  await put("broken/package.json", "bad json");
  const inventory = await buildConfigInventory(agentDir);
  expect(inventory.packages.find(pkg => pkg.source === "./kit")).toMatchObject({ name: "pi-review", version: "1.2.0", description: "Review changes", author: "Dev" });
  expect(inventory.packages.find(pkg => pkg.source === "./broken")).toMatchObject({ source: "./broken" });
});
