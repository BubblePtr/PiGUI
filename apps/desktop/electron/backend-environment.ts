import * as fs from "node:fs";
import { join } from "node:path";

// Pace is dogfooded: the packaged app is the daily driver while `bun run dev`
// runs a second instance from a checkout. Both would otherwise share ~/.pace
// (journal, projections, preflight status), so an unpackaged app defaults to a
// sibling directory. An explicit PACE_DATA_DIR (E2E, manual override) wins;
// PIGUI_DATA_DIR remains a one-minor-version alias.
function resolveDataDirOverride(env: NodeJS.ProcessEnv): string | undefined {
  if (env.PACE_DATA_DIR) return env.PACE_DATA_DIR;
  if (env.PIGUI_DATA_DIR) {
    console.warn("PIGUI_DATA_DIR is deprecated; use PACE_DATA_DIR.");
    return env.PIGUI_DATA_DIR;
  }
}

export function resolveBackendEnvironment(input: {
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  homeDir: string;
  appPath: string;
  resourcesPath: string;
}): NodeJS.ProcessEnv {
  const env = {
    ...input.env,
    PACE_PI_RUNTIME_DIR: input.isPackaged
      ? join(input.resourcesPath, "pi-runtime/node_modules/@earendil-works/pi-coding-agent")
      : fs.realpathSync(join(input.appPath, "../../packages/backend/node_modules/@earendil-works/pi-coding-agent")),
  };
  if (resolveDataDirOverride(env) || input.isPackaged) {
    return env;
  }

  return {
    ...env,
    PACE_DATA_DIR: migrateDirectory(
      join(input.homeDir, ".pace-dev"),
      join(input.homeDir, ".pigui-dev"),
    ),
  };
}

// Chromium allows one running process per profile directory: a second Electron
// on the same userData hands off to the first and exits 0. Without its own
// profile the dev instance cannot even start next to the installed app, and
// renderer localStorage (project registry, drafts) would be shared. E2E passes
// --user-data-dir explicitly and must keep that profile.
export function resolveDevelopmentUserDataPath(input: {
  isPackaged: boolean;
  hasUserDataDirSwitch: boolean;
  userDataPath: string;
}): string | null {
  if (input.isPackaged || input.hasUserDataDirSwitch) {
    return null;
  }

  return `${input.userDataPath}-dev`;
}

function migrateDirectory(path: string, legacyPath: string): string {
  if (fs.existsSync(legacyPath)) {
    try {
      if (fs.existsSync(path) && fs.readdirSync(path).length === 0 && fs.readdirSync(legacyPath).length > 0) {
        // Electron may have created the profile before migration could run.
        fs.rmdirSync(path);
      }
      if (!fs.existsSync(path)) fs.renameSync(legacyPath, path);
    } catch (error) {
      console.warn(`Pace could not migrate ${legacyPath} to ${path}; continuing with the old directory.`, error);
      return legacyPath;
    }
  }
  fs.mkdirSync(path, { recursive: true });
  return path;
}

export function resolveUserDataPath(input: {
  appDataPath: string;
  isPackaged: boolean;
} & (
  | { hasUserDataDirSwitch: true; userDataPath: string }
  | { hasUserDataDirSwitch: false }
)): string {
  if (input.hasUserDataDirSwitch) {
    return input.userDataPath;
  }

  const path = join(input.appDataPath, input.isPackaged ? "Pace" : "Pace-dev");
  return migrateDirectory(path, join(input.appDataPath, "@pigui", input.isPackaged ? "desktop" : "desktop-dev"));
}
