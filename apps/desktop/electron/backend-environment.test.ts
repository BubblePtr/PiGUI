import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveBackendEnvironment,
  resolveDevelopmentUserDataPath,
  resolveUserDataPath,
} from "./backend-environment";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync) };

});

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "pace-environment-")); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); });

describe("resolveBackendEnvironment", () => {
  it("keeps an explicit PACE_DATA_DIR untouched in every mode", () => {
    const env = { PACE_DATA_DIR: "/tmp/e2e-data", PATH: "/bin" };

    expect(resolveBackendEnvironment({ env, isPackaged: false, homeDir: home })).toEqual(env);
    expect(resolveBackendEnvironment({ env, isPackaged: true, homeDir: home })).toEqual(env);
  });

  it("points an unpackaged app at ~/.pace-dev so dev runs never touch real data", () => {
    const result = resolveBackendEnvironment({
      env: { PATH: "/bin" },
      isPackaged: false,
      homeDir: home,
    });

    expect(result.PACE_DATA_DIR).toBe(`${home}/.pace-dev`);
    expect(result.PATH).toBe("/bin");
  });

  it("leaves the packaged app on the backend default (~/.pace)", () => {
    const result = resolveBackendEnvironment({
      env: { PATH: "/bin" },
      isPackaged: true,
      homeDir: home,
    });

    expect(result).toEqual({ PATH: "/bin" });
    expect(result).not.toHaveProperty("PACE_DATA_DIR");
  });

  it("treats an empty PACE_DATA_DIR as unset", () => {
    const result = resolveBackendEnvironment({
      env: { PACE_DATA_DIR: "" },
      isPackaged: false,
      homeDir: home,
    });

    expect(result.PACE_DATA_DIR).toBe(`${home}/.pace-dev`);
  });

  it("falls back to PIGUI_DATA_DIR with a deprecation warning", () => {
    const env = { PIGUI_DATA_DIR: "/tmp/legacy-data", PATH: "/bin" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(resolveBackendEnvironment({ env, isPackaged: false, homeDir: home })).toEqual(env);
      expect(resolveBackendEnvironment({ env, isPackaged: true, homeDir: home })).toEqual(env);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("PIGUI_DATA_DIR"));
    } finally {
      warn.mockRestore();
    }
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
    expect(result.PACE_DATA_DIR).toBe(join(home, ".pace-dev"));
    expect(readFileSync(join(result.PACE_DATA_DIR!, "history"), "utf8")).toBe(".pigui-dev");
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
    expect(result.PACE_DATA_DIR).toBe(old);
    expect(readFileSync(join(old, "history"), "utf8")).toBe("dev history");
    expect(existsSync(join(home, ".pace-dev"))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(old), error);
  } finally {
    warn.mockRestore();
  }
});

it("does not migrate dev history when a data override is present", () => {
  mkdirSync(join(home, ".pigui-dev"));
  const env = { PACE_DATA_DIR: join(home, "custom") };
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
  expect(result.PACE_DATA_DIR).toBe(join(home, ".pace-dev"));
  for (const name of [".pigui-dev", ".pace-dev"]) {
    expect(readFileSync(join(home, name, "history"), "utf8")).toBe(name);
  }
});


describe.each([true, false])("Electron userData migration (packaged: %s)", (isPackaged) => {
  function paths() {
    const appDataPath = join(home, "Application Support");
    const suffix = isPackaged ? "" : "-dev";
    return {
      input: { appDataPath, isPackaged, hasUserDataDirSwitch: false as const },
      path: join(appDataPath, `Pace${suffix}`),
      old: join(appDataPath, "@pigui", `desktop${suffix}`),
    };
  }

  it("creates the selected profile for a fresh install", () => {
    const { input, path } = paths();
    expect(resolveUserDataPath(input)).toBe(path);
    expect(existsSync(path)).toBe(true);
  });
  it("moves profile contents without touching the other mode's profile", () => {
    const { input, path, old } = paths();
    const other = join(input.appDataPath, "@pigui", isPackaged ? "desktop-dev" : "desktop");
    for (const directory of [old, other]) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "Local State"), directory);
    }
    expect(resolveUserDataPath(input)).toBe(path);
    expect(readFileSync(join(path, "Local State"), "utf8")).toBe(old);
    expect(readFileSync(join(other, "Local State"), "utf8")).toBe(other);
    expect(existsSync(old)).toBe(false);
    expect(resolveUserDataPath(input)).toBe(path);
  });

  it("migrates legacy preferences when Electron has created an empty destination", () => {
    const { input, path, old } = paths();
    mkdirSync(path, { recursive: true });
    mkdirSync(join(old, "Local Storage"), { recursive: true });
    writeFileSync(join(old, "Local Storage", "preferences"), "projects and drafts");
    expect(resolveUserDataPath(input)).toBe(path);
    expect(readFileSync(join(path, "Local Storage", "preferences"), "utf8")).toBe("projects and drafts");
    expect(existsSync(old)).toBe(false);
  });

  it("leaves old and new profile contents intact when both exist", () => {
    const { input, path, old } = paths();
    for (const directory of [old, path]) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "Local State"), directory);
    }
    expect(resolveUserDataPath(input)).toBe(path);
    for (const directory of [old, path]) {
      expect(readFileSync(join(directory, "Local State"), "utf8")).toBe(directory);
    }
  });

  it("skips migration and directory creation for an explicit Chromium profile", () => {
    const { input, path, old } = paths();
    mkdirSync(old, { recursive: true });
    writeFileSync(join(old, "Local State"), "preferences");
    const override = join(home, "e2e-profile");
    expect(resolveUserDataPath({ ...input, userDataPath: override, hasUserDataDirSwitch: true })).toBe(override);
    expect(readFileSync(join(old, "Local State"), "utf8")).toBe("preferences");
    expect(existsSync(path)).toBe(false);
    expect(existsSync(override)).toBe(false);
  });

  it.each(["EXDEV", "EACCES"])("keeps the old Chromium profile usable after %s", (code) => {
    const { input, path, old } = paths();
    mkdirSync(old, { recursive: true });
    writeFileSync(join(old, "Local State"), "preferences");
    const error = Object.assign(new Error("migration failed"), { code });
    vi.mocked(renameSync).mockImplementationOnce(() => { throw error; });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(resolveUserDataPath(input)).toBe(old);
      expect(readFileSync(join(old, "Local State"), "utf8")).toBe("preferences");
      expect(existsSync(path)).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(old), error);
    } finally {
      warn.mockRestore();
    }
  });

});
