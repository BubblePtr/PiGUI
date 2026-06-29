import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      "@pigui/core/testing": resolve(__dirname, "packages/core/src/testing.ts"),
      "@pigui/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@pigui/backend": resolve(__dirname, "packages/backend/src/index.ts"),
      "@": resolve(__dirname, "apps/desktop/src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    pool: "forks",
    setupFiles: ["./apps/desktop/src/test/setup.ts"],
  },
});
