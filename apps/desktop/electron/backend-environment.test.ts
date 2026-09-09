import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveBackendEnvironment,
  resolveDevelopmentUserDataPath,
} from "./backend-environment";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync) };

});

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "pace-environment-")); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

describe("resolveBackendEnvironment", () => {
  it("keeps an explicit PIGUI_DATA_DIR untouched in every mode", () => {
    const env = { PIGUI_DATA_DIR: "/tmp/e2e-data", PATH: "/bin" };

    expect(resolveBackendEnvironment({ env, isPackaged: false, homeDir: home })).toEqual(env);
    expect(resolveBackendEnvironment({ env, isPackaged: true, homeDir: home })).toEqual(env);
  });

  it("points an unpackaged app at ~/.pace-dev so dev runs never touch real data", () => {
    const result = resolveBackendEnvironment({
      env: { PATH: "/bin" },
      isPackaged: false,
      homeDir: home,
    });

    expect(result.PIGUI_DATA_DIR).toBe(`${home}/.pace-dev`);
    expect(result.PATH).toBe("/bin");
  });

  it("leaves the packaged app on the backend default (~/.pace)", () => {
    const result = resolveBackendEnvironment({
      env: { PATH: "/bin" },
      isPackaged: true,
      homeDir: home,
    });

    expect(result).toEqual({ PATH: "/bin" });
    expect(result).not.toHaveProperty("PIGUI_DATA_DIR");
  });

  it("treats an empty PIGUI_DATA_DIR as unset", () => {
    const result = resolveBackendEnvironment({
      env: { PIGUI_DATA_DIR: "" },
      isPackaged: false,
      homeDir: home,
    });

    expect(result.PIGUI_DATA_DIR).toBe(`${home}/.pace-dev`);
  });
});

describe("resolveDevelopmentUserDataPath", () => {
  const userDataPath = "/Users/tester/Library/Application Support/Pace";

  it("gives an unpackaged app its own Electron profile beside the installed app's", () => {
    expect(
      resolveDevelopmentUserDataPath({
        isPackaged: false,
        hasUserDataDirSwitch: false,
        userDataPath,
      }),
    ).toBe("/Users/tester/Library/Application Support/Pace-dev");
  });

  it("does not touch the packaged app's profile", () => {
    expect(
      resolveDevelopmentUserDataPath({
        isPackaged: true,
        hasUserDataDirSwitch: false,
        userDataPath,
      }),
    ).toBeNull();
  });

  it("defers to an explicit --user-data-dir (E2E launches its own profile)", () => {
    expect(
      resolveDevelopmentUserDataPath({
        isPackaged: false,
        hasUserDataDirSwitch: true,
        userDataPath: "/tmp/e2e-profile",
      }),
    ).toBeNull();
  });
});

  it("moves only the legacy dev data and keeps installed data isolated", () => {
    for (const name of [".pigui", ".pigui-dev"]) {
      mkdirSync(join(home, name));
      writeFileSync(join(home, name, "history"), name);
    }
    const result = resolveBackendEnvironment({ env: {}, isPackaged: false, homeDir: home });
    expect(result.PIGUI_DATA_DIR).toBe(join(home, ".pace-dev"));
    expect(readFileSync(join(result.PIGUI_DATA_DIR!, "history"), "utf8")).toBe(".pigui-dev");
    expect(readFileSync(join(home, ".pigui", "history"), "utf8")).toBe(".pigui");
    expect(existsSync(join(home, ".pigui-dev"))).toBe(false);
    expect(existsSync(join(home, ".pace"))).toBe(false);
  });

it.each(["EXDEV", "EACCES"])("keeps dev history available when migration fails with %s", (code) => {
  const old = join(home, ".pigui-dev");
  mkdirSync(old);
  writeFileSync(join(old, "history"), "dev history");
  const error = Object.assign(new Error("migration failed"), { code });
  vi.mocked(renameSync).mockImplementationOnce(() => { throw error; });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const result = resolveBackendEnvironment({ env: {}, isPackaged: false, homeDir: home });
    expect(result.PIGUI_DATA_DIR).toBe(old);
    expect(readFileSync(join(old, "history"), "utf8")).toBe("dev history");
    expect(existsSync(join(home, ".pace-dev"))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(old), error);
  } finally {
    warn.mockRestore();
  }
});

it("does not migrate dev history when a data override is present", () => {
  mkdirSync(join(home, ".pigui-dev"));
  const env = { PIGUI_DATA_DIR: join(home, "custom") };
  expect(resolveBackendEnvironment({ env, isPackaged: false, homeDir: home })).toEqual(env);
  expect(existsSync(join(home, ".pigui-dev"))).toBe(true);
  expect(existsSync(join(home, ".pace-dev"))).toBe(false);
});

it("prefers existing Pace dev data without modifying either directory", () => {
  for (const name of [".pigui-dev", ".pace-dev"]) {
    mkdirSync(join(home, name));
    writeFileSync(join(home, name, "history"), name);
  }
  const result = resolveBackendEnvironment({ env: {}, isPackaged: false, homeDir: home });
  expect(result.PIGUI_DATA_DIR).toBe(join(home, ".pace-dev"));
  for (const name of [".pigui-dev", ".pace-dev"]) {
    expect(readFileSync(join(home, name, "history"), "utf8")).toBe(name);
  }
});
