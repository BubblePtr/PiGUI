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

      const continueButton = testApp.window.getByRole("button", { name: /Continue/i });
      await expect(continueButton).toBeEnabled({ timeout: 30_000 });
      await continueButton.click();

      await expect(testApp.window.getByRole("button", { name: /add project/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect(testApp.window.getByText("Before your first session")).toHaveCount(0);
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
});
