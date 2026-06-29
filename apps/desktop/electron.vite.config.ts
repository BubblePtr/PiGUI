import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";

const mainBuild = {
  externalizeDeps: true,
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
  externalizeDeps: false,
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
  "@pig/core/testing": resolve(__dirname, "../../packages/core/src/testing.ts"),
  "@pig/core": resolve(__dirname, "../../packages/core/src/index.ts"),
  "@pig/backend": resolve(__dirname, "../../packages/backend/src/index.ts"),
  "@": resolve(__dirname, "src"),
};

export default defineConfig({
  main: {
    build: mainBuild as any,
    resolve: { alias: coreAlias },
  },
  preload: {
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
