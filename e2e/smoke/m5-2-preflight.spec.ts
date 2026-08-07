import { expect, test } from "@playwright/test";
import { launchPiGUI } from "../fixtures/electron-app";

test.describe("M5.2: First-run preflight", () => {
  test("gates first launch until required checks pass and Continue is pressed", async () => {
    const testApp = await launchPiGUI({
      requirePreflight: true,
      seedPreflightAuth: true,
    });

    try {
      await expect(testApp.window.getByText("Before your first session")).toBeVisible();
      await expect(testApp.window.getByText("Pi Runtime", { exact: true }).first()).toBeVisible();
      await expect(testApp.window.getByText("Data directory", { exact: true }).first()).toBeVisible();
      await expect(testApp.window.getByText("Model auth", { exact: true }).first()).toBeVisible();
      await expect(testApp.window.getByText("Git", { exact: true }).first()).toBeVisible();

      // Preflight is titlebar-only — no app navigation sidebar (DF-013).
      await expect(testApp.window.getByTestId("app-frame-titlebar-only")).toBeVisible();
      await expect(testApp.window.getByTestId("sidebar-projects")).toHaveCount(0);
      await expect(
        testApp.window.getByRole("button", { name: /Collapse sidebar|Expand sidebar/i }),
      ).toHaveCount(0);

      const continueButton = testApp.window.getByRole("button", { name: /Continue/i });
      await expect(continueButton).toBeEnabled({ timeout: 30_000 });
      await continueButton.click();

      await expect(testApp.window.getByRole("button", { name: /add project/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(testApp.window.getByText("Before your first session")).toHaveCount(0);
      // After Continue, main shell has sidebar again.
      await expect(testApp.window.getByTestId("sidebar-projects")).toBeVisible();
    } finally {
      await testApp.close();
    }
  });

  test("blocks Continue when model auth is missing", async () => {
    const testApp = await launchPiGUI({
      requirePreflight: true,
      seedPreflightAuth: false,
    });

    try {
      await expect(testApp.window.getByText("Before your first session")).toBeVisible();
      await expect(testApp.window.getByText(/No provider credentials/i).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        testApp.window.getByRole("button", { name: /Continue \(disabled\)|Continue/i }),
      ).toBeDisabled();
    } finally {
      await testApp.close();
    }
  });

  test("keeps Continue enabled when optional Git is missing", async () => {
    const testApp = await launchPiGUI({
      requirePreflight: true,
      seedPreflightAuth: true,
      forceGitMissing: true,
    });

    try {
      await expect(testApp.window.getByText("Before your first session")).toBeVisible();
      await expect(
        testApp.window.getByText(/Not installed — Changes \/ worktree limited/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      await expect(testApp.window.getByRole("button", { name: /Continue →/i })).toBeEnabled();
      await testApp.window.getByRole("button", { name: /Continue →/i }).click();
      await expect(testApp.window.getByRole("button", { name: /add project/i })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await testApp.close();
    }
  });
});
