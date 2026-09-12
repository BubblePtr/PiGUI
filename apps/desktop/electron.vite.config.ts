import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// The @pace/* workspace packages are internal TS source, not external runtime
// deps — bundle them into the main/preload output so the utilityProcess can find
// the backend service. Node builtins stay externalized by the plugin default.
const internalPackages = ["@pace/core", "@pace/backend"];
const piPackageDirectory = realpathSync(
  resolve(
    __dirname,
    "../../packages/backend/node_modules/@earendil-works/pi-coding-agent",
  ),
);
const piPackage = JSON.parse(readFileSync(join(piPackageDirectory, "package.json"), "utf8"));
const appPackage = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
const mainBuild = {
  rollupOptions: {
    external: [/^@earendil-works\//],
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
    // Two entries that must stay self-contained: a sandboxed preload's
    // `require` cannot resolve a relative chunk, so neither may import a module
    // the other does (PRD S2 constraint 6). They share types only.
    input: {
      preload: resolve(__dirname, "electron/preload.ts"),
      "browser-annotation-preload": resolve(
        __dirname,
        "electron/browser-annotation-preload.ts",
      ),
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
  "@pace/core/testing": resolve(__dirname, "../../packages/core/src/testing.ts"),
  "@pace/core": resolve(__dirname, "../../packages/core/src/index.ts"),
  "@pace/backend": resolve(__dirname, "../../packages/backend/src/index.ts"),
  "@": resolve(__dirname, "src"),
};

// bun nests a second `react` under @astryxdesign/core. Without pinning, Vite
// prebundles Astryx CodeBlock's `useTranslator` against that copy while the
// renderer uses the workspace copy — React 19 throws `reading 'use'`.
const requireFromRepo = createRequire(resolve(__dirname, "../../package.json"));
const reactPackage = dirname(requireFromRepo.resolve("react/package.json"));
const reactDomPackage = dirname(requireFromRepo.resolve("react-dom/package.json"));
const rendererReactAlias = {
  ...coreAlias,
  react: reactPackage,
  "react-dom": reactDomPackage,
};

export default defineConfig({
  main: {
    define: {
      __PACE_APP_VERSION__: JSON.stringify(appPackage.version),
      __PACE_PI_VERSION__: JSON.stringify(piPackage.version),
    },
    plugins: [
      externalizeDepsPlugin({ exclude: [...internalPackages, "electron-updater"] }),
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
    resolve: {
      alias: rendererReactAlias,
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom/client",
      ],
    },
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
  },
});
