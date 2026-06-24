import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const herouiProComponentEntry = fileURLToPath(
  new URL("./vendor/herouipro-v3/src/components/index.ts", import.meta.url),
);
const herouiProComponentCss = fileURLToPath(
  new URL("./vendor/herouipro-v3/src/css/components/index.css", import.meta.url),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: [
      {
        find: "@heroui-pro/react/css",
        replacement: herouiProComponentCss,
      },
      {
        find: "@heroui-pro/react",
        replacement: herouiProComponentEntry,
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
