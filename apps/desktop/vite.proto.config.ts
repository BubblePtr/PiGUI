// PROTO cot-live — renderer-only Vite config for browser preview of /proto/*
// and /design without booting Electron. Mirrors the renderer block of
// electron.vite.config.ts. Throwaway; deleted with the prototype.
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      "@pigui/core/testing": resolve(__dirname, "../../packages/core/src/testing.ts"),
      "@pigui/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@pigui/backend": resolve(__dirname, "../../packages/backend/src/index.ts"),
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
});
