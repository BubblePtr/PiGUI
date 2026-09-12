import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./layout",
  use: {
    baseURL: "http://127.0.0.1:1422",
    viewport: { width: 1440, height: 960 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bun run dev:mock --port 1422",
    url: "http://127.0.0.1:1422",
    reuseExistingServer: false,
  },
});
