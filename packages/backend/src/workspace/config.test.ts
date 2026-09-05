import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(inventory.packages).toEqual(["./local-package"]);
    expect(inventory.extensions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringContaining("enabled.ts"), enabled: true }),
      expect.objectContaining({ name: expect.stringContaining("disabled.ts"), enabled: false }),
    ]));
    expect(JSON.stringify(inventory)).not.toContain("sk-test-secret");
    expect(await readFile(join(agentDir, "settings.json"), "utf8")).toBe(before);
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

  it("lists only enabled native skills, including package resources", async () => {
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
    expect(inventory.skills.map(skill => skill.name).sort()).toEqual(["enabled", "packaged"]);
  });

  it("keeps missing packages visible without installing them", async () => {
    const { agentDir } = await fixture({ packages: [{ source: "npm:pigui-inventory-not-installed@0.0.0" }] });
    const inventory = await buildConfigInventory(agentDir);
    expect(inventory.packages).toEqual(["npm:pigui-inventory-not-installed@0.0.0"]);
    expect(inventory.extensions).toEqual([]);
    await expect(access(join(agentDir, "npm"))).rejects.toThrow();
  });

  it("allows missing settings and inventory directories", async () => {
    const { agentDir } = await fixture();
    await rm(join(agentDir, "settings.json"));
    await expect(buildConfigInventory(agentDir)).resolves.toEqual({ packages: [], extensions: [], skills: [], promptTemplates: [] });
  });
});
