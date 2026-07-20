import { copyFile, mkdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";

// The @pigui/* workspace packages are internal TS source, not external runtime
// deps — bundle them into the main/preload output so the utilityProcess can find
// the backend service. Node builtins stay externalized by the plugin default.
const internalPackages = ["@pigui/core", "@pigui/backend"];
const piPackageDirectory = realpathSync(
  resolve(
    __dirname,
    "../../packages/backend/node_modules/@earendil-works/pi-coding-agent",
  ),
);
const requireFromPi = createRequire(join(piPackageDirectory, "package.json"));
const photonWasmPath = requireFromPi.resolve(
  "@silvia-odwyer/photon-node/photon_rs_bg.wasm",
);

function copyMainRuntimeAssets(): Plugin {
  return {
    name: "pigui-copy-main-runtime-assets",
    async writeBundle(options) {
      if (!options.dir) {
        throw new Error("Main build output directory is required.");
      }

      // The bundled Photon chunk resolves its WASM beside the emitted chunk.
      const outputPath = resolve(options.dir, "chunks/photon_rs_bg.wasm");

      await mkdir(dirname(outputPath), { recursive: true });
      await copyFile(photonWasmPath, outputPath);
    },
  };
}

const mainBuild = {
  rollupOptions: {
    input: {
      main: resolve(__dirname, "electron/main.ts"),
      backend: resolve(__dirname, "electron/backend.ts"),
    },
    output: {
      entryFileNames: "[name].js",
    },
  },
};

const preloadBuild = {
  rollupOptions: {
    input: {
      preload: resolve(__dirname, "electron/preload.ts"),
    },
    output: {
      entryFileNames: "[name].js",
      format: "cjs",
    },
  },
};

const rendererBuild = {
  rollupOptions: {
    input: resolve(__dirname, "index.html"),
  },
};

const coreAlias = {
  "@pigui/core/testing": resolve(__dirname, "../../packages/core/src/testing.ts"),
  "@pigui/core": resolve(__dirname, "../../packages/core/src/index.ts"),
  "@pigui/backend": resolve(__dirname, "../../packages/backend/src/index.ts"),
  "@": resolve(__dirname, "src"),
};

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({ exclude: internalPackages }),
      copyMainRuntimeAssets(),
    ],
    build: mainBuild as any,
    resolve: { alias: coreAlias },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: internalPackages })],
    build: preloadBuild as any,
    resolve: { alias: coreAlias },
  },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    build: rendererBuild as any,
    resolve: { alias: coreAlias },
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
  },
});
