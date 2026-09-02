// Stages @lydell/node-pty (+ its platform binary package) as real directories
// inside apps/desktop/node_modules before electron-builder runs.
//
// Why: bun's isolated linker keeps the real files in the root node_modules/.bun
// store and only symlinks apps/desktop/node_modules/@lydell/node-pty. The
// electron-builder app directory is apps/desktop, so files outside it are
// unreachable, and the platform package (@lydell/node-pty-<os>-<arch>) is not
// even symlinked — it resolves through the store's nested node_modules at
// runtime. electron-builder.yml re-includes node_modules/@lydell/**, so what
// lands here as real files is exactly what ships.
import { cpSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "desktop",
);
const requireFromDesktop = createRequire(join(desktopDirectory, "package.json"));

// Resolve the entry point (not package.json — exports maps hide it) and take
// its directory: <pkg>/index.js or <pkg>/lib/index.js → <pkg>. require.resolve
// dereferences bun's store symlinks, so the result is always the real dir.
function packageDirectoryOf(requireFrom, name) {
  const entry = requireFrom.resolve(name);

  return entry.replace(/\/lib\/index\.js$/, "").replace(/\/index\.js$/, "");
}

function tryPackageDirectory(requireFrom, name) {
  try {
    return packageDirectoryOf(requireFrom, name);
  } catch {
    return undefined;
  }
}

const nodePtyDirectory = packageDirectoryOf(requireFromDesktop, "@lydell/node-pty");
const platformName = `@lydell/node-pty-${process.platform}-${process.arch}`;
// The platform binary package hides in different places per install layout:
// directly resolvable (npm/hoisted), beside the real node-pty dir (pnpm-style
// or bun's pre-staging symlink), or as its own top-level entry in bun's
// isolated store (after staging replaced the symlink with real files).
const requireFromNodePty = createRequire(join(nodePtyDirectory, "index.js"));
const bunStoreDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  ".bun",
);
const bunStoreEntry = (() => {
  try {
    return readdirSync(bunStoreDirectory).find((entry) =>
      entry.startsWith(`@lydell+node-pty-${process.platform}-${process.arch}@`),
    );
  } catch {
    return undefined;
  }
})();
const platformDirectory =
  tryPackageDirectory(requireFromDesktop, platformName) ??
  tryPackageDirectory(requireFromNodePty, platformName) ??
  (bunStoreEntry
    ? join(bunStoreDirectory, bunStoreEntry, "node_modules", "@lydell", `node-pty-${process.platform}-${process.arch}`)
    : undefined);

if (!platformDirectory) {
  console.error(
    `[stage-node-pty] ${platformName} is not installed for ${process.platform}/${process.arch}; the packaged Terminal surface would break.`,
  );
  process.exit(1);
}

const packages = [
  ["@lydell/node-pty", nodePtyDirectory],
  [platformName, platformDirectory],
];

for (const [name, packageDirectory] of packages) {
  const target = join(desktopDirectory, "node_modules", ...name.split("/"));

  if (packageDirectory === target) {
    // Already staged by a previous run; leave it untouched.
    console.log(`[stage-node-pty] ${name} already staged`);
    continue;
  }

  rmSync(target, { recursive: true, force: true });
  cpSync(packageDirectory, target, { recursive: true, dereference: true });
  console.log(`[stage-node-pty] staged ${name} → ${target}`);
}
