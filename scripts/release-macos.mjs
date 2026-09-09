import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const requiredSecrets = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "APPLE_API_KEY_P8",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

export function validateRelease({ tag, rootVersion, appVersion, platform, arch, secrets = {} }) {
  const match = typeof tag === "string"
    ? /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(tag)
    : null;
  if (!match || match[0] !== tag || match[4]?.split(".").some(part => /^0\d+$/.test(part))) {
    throw new Error("Release tag must be vMAJOR.MINOR.PATCH, with optional SemVer prerelease and build metadata.");
  }

  const version = tag.slice(1);
  for (const [name, actual] of [["root package.json", rootVersion], ["apps/desktop/package.json", appVersion]]) {
    if (actual !== version) throw new Error(`${name} version ${actual} does not match release tag ${tag}.`);
  }
  // Staging resolves the host's node-pty binary, so cross-compilation would ship the wrong module.
  if (platform !== "darwin" || arch !== "arm64") {
    throw new Error(`macOS releases require darwin/arm64; received ${platform}/${arch}.`);
  }
  const missing = requiredSecrets.filter(name => !secrets[name]?.trim());
  if (missing.length) throw new Error(`Missing release secrets: ${missing.join(", ")}.`);

  return {
    version,
    prerelease: Boolean(match[4]),
    artifact: `Pace-${version}-arm64.dmg`,
    zipArtifact: `Pace-${version}-arm64.zip`,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const repo = fileURLToPath(new URL("../", import.meta.url));
    const readVersion = path => JSON.parse(readFileSync(resolve(repo, path), "utf8")).version;
    const release = validateRelease({
      tag: process.argv[2],
      rootVersion: readVersion("package.json"),
      appVersion: readVersion("apps/desktop/package.json"),
      platform: process.platform,
      arch: process.arch,
      secrets: process.env,
    });
    const output = Object.entries(release).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
    process.stdout.write(output);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
