import { describe, expect, it } from "vitest";
import {
  resolveBackendEnvironment,
  resolveDevelopmentUserDataPath,
} from "./backend-environment";

const home = "/Users/tester";

describe("resolveBackendEnvironment", () => {
  it("keeps an explicit PIGUI_DATA_DIR untouched in every mode", () => {
    const env = { PIGUI_DATA_DIR: "/tmp/e2e-data", PATH: "/bin" };

    expect(resolveBackendEnvironment({ env, isPackaged: false, homeDir: home })).toEqual(env);
    expect(resolveBackendEnvironment({ env, isPackaged: true, homeDir: home })).toEqual(env);
  });

  it("points an unpackaged app at ~/.pigui-dev so dev runs never touch real data", () => {
    const result = resolveBackendEnvironment({
      env: { PATH: "/bin" },
      isPackaged: false,
      homeDir: home,
    });

    expect(result.PIGUI_DATA_DIR).toBe(`${home}/.pigui-dev`);
    expect(result.PATH).toBe("/bin");
  });

  it("leaves the packaged app on the backend default (~/.pigui)", () => {
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

    expect(result.PIGUI_DATA_DIR).toBe(`${home}/.pigui-dev`);
  });
});

describe("resolveDevelopmentUserDataPath", () => {
  const userDataPath = `${home}/Library/Application Support/@pigui/desktop`;

  it("gives an unpackaged app its own Electron profile beside the installed app's", () => {
    expect(
      resolveDevelopmentUserDataPath({
        isPackaged: false,
        hasUserDataDirSwitch: false,
        userDataPath,
      }),
    ).toBe(`${home}/Library/Application Support/@pigui/desktop-dev`);
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
