import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDataDir } from "./session-event-journal";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync) };
});

const homes: string[] = [];
function temporaryHome() {
  const home = mkdtempSync(join(tmpdir(), "pace-data-migration-"));
  homes.push(home);
  return home;
}
afterEach(() => homes.splice(0).forEach((home) => rmSync(home, { recursive: true, force: true })));

describe("backend data directory migration", () => {
  it("creates a new default directory for a fresh install", () => {
    const home = temporaryHome();
    const path = resolveDataDir({}, home);
    expect(path).toBe(join(home, ".pace"));
    expect(existsSync(path)).toBe(true);
  });
  it("moves the old directory once and preserves journal contents", () => {
    const home = temporaryHome();
    const old = join(home, ".pigui");
    mkdirSync(old);
    writeFileSync(join(old, "journal.jsonl"), "session history");
    const path = resolveDataDir({}, home);
    expect(readFileSync(join(path, "journal.jsonl"), "utf8")).toBe("session history");
    expect(existsSync(old)).toBe(false);
    expect(resolveDataDir({}, home)).toBe(path);
  });

  it("keeps both directories intact when the new directory already exists", () => {
    const home = temporaryHome();
    for (const name of [".pigui", ".pace"]) {
      mkdirSync(join(home, name));
      writeFileSync(join(home, name, "journal.jsonl"), name);
    }
    expect(resolveDataDir({}, home)).toBe(join(home, ".pace"));
    for (const name of [".pigui", ".pace"]) {
      expect(readFileSync(join(home, name, "journal.jsonl"), "utf8")).toBe(name);
    }
  });

  it("skips migration for an explicit data directory", () => {
    const home = temporaryHome();
    mkdirSync(join(home, ".pigui"));
    const override = join(home, "custom");
    expect(resolveDataDir({ PIGUI_DATA_DIR: override }, home)).toBe(override);
    expect(existsSync(join(home, ".pigui"))).toBe(true);
    expect(existsSync(join(home, ".pace"))).toBe(false);
  });

  it.each(["EXDEV", "EACCES"])("uses old data and warns if rename fails with %s", (code) => {
    const home = temporaryHome();
    const old = join(home, ".pigui");
    mkdirSync(old);
    writeFileSync(join(old, "journal.jsonl"), "session history");
    const error = Object.assign(new Error("migration failed"), { code });
    vi.mocked(renameSync).mockImplementationOnce(() => { throw error; });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(resolveDataDir({}, home)).toBe(old);
      expect(readFileSync(join(old, "journal.jsonl"), "utf8")).toBe("session history");
      expect(existsSync(join(home, ".pace"))).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(old), error);
    } finally {
      warn.mockRestore();
    }
  });

});
