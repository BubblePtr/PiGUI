import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Source tests and standalone backend consumers resolve the workspace install.
// Electron always supplies the explicit development or packaged package root.
export const piRuntimeDirectory = process.env.PACE_PI_RUNTIME_DIR
  ? realpathSync(process.env.PACE_PI_RUNTIME_DIR)
  : dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
const manifest = JSON.parse(readFileSync(join(piRuntimeDirectory, "package.json"), "utf8"));
if (manifest.name !== "@earendil-works/pi-coding-agent") {
  throw new Error(`Invalid Pi runtime package at ${piRuntimeDirectory}: ${manifest.name}`);
}
function resolvePeerFile(name: string, file: string): string {
  for (let directory = piRuntimeDirectory; ; directory = dirname(directory)) {
    const candidate = join(directory, "node_modules", name, file);
    if (existsSync(candidate)) return realpathSync(candidate);
    if (dirname(directory) === directory) {
      throw new Error(`Missing Pi runtime dependency ${name}/${file} from ${piRuntimeDirectory}`);
    }
  }
}
const sdkUrl = pathToFileURL(join(piRuntimeDirectory, "dist/index.js")).href;
const oauthUrl = pathToFileURL(resolvePeerFile("@earendil-works/pi-ai", "dist/bun-oauth.js")).href;

export const piSdk: typeof import("@earendil-works/pi-coding-agent") = await import(/* @vite-ignore */ sdkUrl);
export const { registerBunOAuthFlows }: typeof import("@earendil-works/pi-ai/bun-oauth") = await import(/* @vite-ignore */ oauthUrl);
export const { DefaultPackageManager, SettingsManager, loadSkills, ModelRegistry, ModelRuntime, readStoredCredential } = piSdk;
export type DefaultPackageManager = import("@earendil-works/pi-coding-agent").DefaultPackageManager;
export type SettingsManager = import("@earendil-works/pi-coding-agent").SettingsManager;
