import * as fs from "node:fs";
import { join } from "node:path";

// PiGUI is dogfooded: the packaged app is the daily driver while `bun run dev`
// runs a second instance from a checkout. Both would otherwise share ~/.pigui
// (journal, projections, preflight status), so an unpackaged app defaults to a
// sibling directory. An explicit PIGUI_DATA_DIR (E2E, manual override) wins.
export function resolveBackendEnvironment(input: {
  env: NodeJS.ProcessEnv;
  isPackaged: boolean;
  homeDir: string;
}): NodeJS.ProcessEnv {
  if (input.env.PIGUI_DATA_DIR || input.isPackaged) {
    return { ...input.env };
  }

  return {
    ...input.env,
    PIGUI_DATA_DIR: migrateDirectory(
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
  if (!fs.existsSync(path) && fs.existsSync(legacyPath)) {
    try {
      fs.renameSync(legacyPath, path);
    } catch (error) {
      console.warn(`Pace could not migrate ${legacyPath} to ${path}; continuing with the old directory.`, error);
      return legacyPath;
    }
  }
  fs.mkdirSync(path, { recursive: true });
  return path;
}
