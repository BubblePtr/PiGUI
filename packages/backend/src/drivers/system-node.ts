import { execFile } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const minimumVersion = "22.19.0";
const probe = `console.log(JSON.stringify({executable:process.execPath,version:process.versions.node,
  hooks:typeof require('node:module').registerHooks==='function'&&!process.versions.electron&&!process.versions.bun}))`;

export type SystemNode =
  | { status: "available"; executable: string; version: string; detail?: undefined }
  | { status: "unavailable"; detail: string };

type Options = {
  platform?: NodeJS.Platform;
  run?: (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<string>;
};

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const { stdout } = await execute(command, args, { env, timeout: 2_000, maxBuffer: 64 * 1024, windowsHide: true });
  return stdout;
}

// Only PATH is recovered from the login shell; credentials and other host settings stay intact.
// Both startup and Recheck use this operation, so new extension children see the checked Node.
export async function prepareSystemNode(env: NodeJS.ProcessEnv = process.env, options: Options = {}): Promise<SystemNode> {
  const platform = options.platform ?? process.platform;
  const invoke = options.run ?? run;
  const visited = new Set<string>();
  const failures: string[] = [];
  const originalPath = env.PATH ?? "";
  const deadline = Date.now() + 6_000;
  let shellPath = "";
  const separator = platform === "win32" ? ";" : delimiter;

  async function inspect(command: string): Promise<SystemNode | undefined> {
    if (!isAbsolute(command) || visited.has(command) || Date.now() >= deadline) return;
    visited.add(command);
    try {
      const info = JSON.parse(await invoke(command, ["-e", probe], env)) as {
        executable?: string; version?: string; hooks?: boolean;
      };
      const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(info.version ?? "");
      if (!version || !(Number(version[1]) > 22 || (Number(version[1]) === 22 && Number(version[2]) >= 19)) || !info.hooks) {
        failures.push(`${command}: Node.js ${minimumVersion}+ with module hooks is required (found ${info.version ?? "unknown"}).`);
        return;
      }
      if (!info.executable || !isAbsolute(info.executable) || !/^node(?:\.exe)?$/i.test(basename(info.executable))) {
        failures.push(`${command}: not a standalone Node executable.`);
        return;
      }
      env.PATH = [...new Set([dirname(info.executable), ...shellPath.split(separator), ...originalPath.split(separator)].filter(Boolean))].join(separator);
      return { status: "available", executable: info.executable, version: info.version! };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        failures.push(`${command}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  function unavailable(): SystemNode {
    return { status: "unavailable", detail: `${failures.slice(0, 3).join("\n")}\nInstall Node.js ${minimumVersion}+ or set PACE_NODE_PATH to its absolute executable path, then restart Pace or Recheck.`.trim() };
  }

  if (env.PACE_NODE_PATH) {
    if (!isAbsolute(env.PACE_NODE_PATH)) failures.push("PACE_NODE_PATH must be an absolute path.");
    const found = await inspect(env.PACE_NODE_PATH);
    if (found) return found;
    if (failures.length === 0) failures.push(`${env.PACE_NODE_PATH}: Node.js could not be executed.`);
    return unavailable();
  }

  async function search(path: string) {
    for (const directory of path.split(separator).filter(Boolean)) {
      const found = await inspect(join(directory, platform === "win32" ? "node.exe" : "node"));
      if (found) return found;
    }
  }

  const inherited = await search(originalPath);
  if (inherited) return inherited;
  if (platform !== "win32") {
    const shell = env.SHELL || userInfo().shell || "/bin/sh";
    try {
      const output = await invoke(shell, ["-ilc", "printf '\\0PACE_PATH\\0%s\\0' \"$PATH\""], { ...env, HOME: env.HOME ?? homedir() });
      shellPath = output.split("\0PACE_PATH\0")[1]?.split("\0")[0] ?? "";
      const found = await search(shellPath);
      if (found) return found;
    } catch {
      // A broken shell profile must not prevent sessions using the embedded Pi engine.
    }
    const home = env.HOME ?? homedir();
    const found = await search([
      ...(platform === "darwin" ? ["/opt/homebrew/bin"] : []), "/usr/local/bin", "/usr/bin",
      join(home, ".volta/bin"), join(home, ".local/bin"), join(home, ".asdf/shims"), join(home, ".local/share/mise/shims"),
    ].join(separator));
    if (found) return found;
  }
  return unavailable();
}
