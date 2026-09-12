// Copy the installed production graph instead of resolving semver again with npm.
// Release builds run bun install --frozen-lockfile before reaching this script.
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestAt = (directory) => JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));

function resolvePackage(from, name) {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(directory) === directory) return undefined;
  }
}

export function stagePiRuntime({
  backend = join(repo, "packages/backend"),
  target = join(repo, "apps/desktop/pi-runtime"),
  platform = process.platform,
  arch = process.arch,
} = {}) {
  function matches(values, target) {
    if (!values) return true;
    const list = Array.isArray(values) ? values : [values];
    if (list.includes(`!${target}`)) return false;
    return list.includes(target) || list.includes("any") || list.every(value => value.startsWith("!"));
  }
  const graph = new Map();
  function collect(source, optional = false) {
    const manifest = manifestAt(source);
    if (!matches(manifest.os, platform) || !matches(manifest.cpu, arch)) {
      if (optional) return false;
      throw new Error(`Incompatible required package ${manifest.name} for ${platform}/${arch}`);
    }
    if (graph.has(source)) return true;
    const dependencies = new Map();
    graph.set(source, { manifest, dependencies });
    const names = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    for (const name of names) {
      const dependency = resolvePackage(source, name);
      if (!dependency) {
        if (name in (manifest.optionalDependencies ?? {}) || manifest.peerDependenciesMeta?.[name]?.optional) continue;
        throw new Error(`Missing production dependency ${name} required by ${source}`);
      }
      const optional = name in (manifest.optionalDependencies ?? {}) || manifest.peerDependenciesMeta?.[name]?.optional;
      if (collect(dependency, optional)) dependencies.set(name, dependency);
    }
    return true;
  }

  const roots = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"];
  for (const name of roots) {
    const source = resolvePackage(backend, name);
    if (!source || manifestAt(source).version !== manifestAt(backend).dependencies[name]) {
      throw new Error(`${name} does not match the pinned backend dependency; run bun install --frozen-lockfile`);
    }
    collect(source);
  }

  rmSync(target, { recursive: true, force: true });
  const installed = new Map();
  function copyPackage(source, destination) {
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, {
      recursive: true,
      dereference: true,
      // Dependencies are traversed explicitly, never copied through Bun's links.
      filter: (path) => path !== join(source, "node_modules"),
    });
    installed.set(destination, source);
  }
  // Hoist one locked instance of every name; keep conflicting versions local to
  // their consumers. No links are needed, including for cycles in the graph.
  for (const [source, { manifest }] of graph) {
    const destination = join(target, "node_modules", manifest.name);
    if (!installed.has(destination)) copyPackage(source, destination);
  }
  function visiblePackage(from, name) {
    for (let directory = from; directory.startsWith(target); directory = dirname(directory)) {
      const destination = join(directory, "node_modules", name);
      if (installed.has(destination)) return destination;
    }
  }
  for (const [destination, source] of installed) {
    for (const [name, dependency] of graph.get(source).dependencies) {
      const visible = visiblePackage(destination, name);
      if (installed.get(visible) !== dependency) {
        copyPackage(dependency, join(destination, "node_modules", name));
      }
    }
  }
  // Check every edge after placement so hoisting cannot silently change a version.
  for (const [destination, source] of installed) {
    for (const [name, dependency] of graph.get(source).dependencies) {
      if (installed.get(visiblePackage(destination, name)) !== dependency) {
        throw new Error(`Staged dependency mismatch: ${destination} → ${name}`);
      }
    }
  }
  console.log(`[stage-pi-runtime] ${platform}/${arch}: ${installed.size} packages, Pi ${manifestAt(resolvePackage(backend, roots[0])).version} → ${target}`);

}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    platform: { type: "string", default: process.env.PACE_TARGET_PLATFORM ?? process.platform },
    arch: { type: "string", default: process.env.PACE_TARGET_ARCH ?? process.arch },
    target: { type: "string", default: join(repo, "apps/desktop/pi-runtime") },
  } });
  stagePiRuntime(values);
}
