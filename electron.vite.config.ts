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

export default defineConfig({
  main: {
    build: mainBuild as any,
  },
  preload: {
    build: preloadBuild as any,
  },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    build: rendererBuild as any,
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
  },
});
