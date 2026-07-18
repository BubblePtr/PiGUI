import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./smoke",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "electron",
      use: {
        // Electron launch is handled per-test via fixtures/electron-app.ts
      },
    },
  ],
});
