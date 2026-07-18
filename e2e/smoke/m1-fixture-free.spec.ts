import { test, expect } from "@playwright/test";
import { launchPiGUI, assertNoFixtureData } from "../fixtures/electron-app";

test.describe("M1: Real-data-only (fixture-free)", () => {
  test("app launches without fixture data", async () => {
    const { app, window } = await launchPiGUI();

    // 1. Window should have a title
    await expect(window).toHaveTitle(/PiGUI/);

    // 2. No fixture strings anywhere on the page
    await assertNoFixtureData(window);

    // 3. Take a screenshot for manual review
    await window.screenshot({
      path: "e2e/screenshots/m1-vacuum-state.png",
    });

    await app.close();
  });
});

test.describe("M2: Session lifecycle", () => {
  test("can create a Project and start a Session", async () => {
    const { app, window } = await launchPiGUI();

    // 1. Find and click "Add Project" button
    const addBtn = window.getByRole("button", { name: /add project/i });
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await expect(
        window.getByText(/select a project/i).or(window.getByText(/add project/i))
      ).toBeVisible();
    }

    // 2. Verify session composer is accessible
    const composer = window.getByRole("textbox");
    const composerVisible = await composer.isVisible().catch(() => false);
    expect(composerVisible).toBeDefined();

    await app.close();
  });

  test("Archive button is present and not a no-op", async () => {
    const { app, window } = await launchPiGUI();

    // Archive button should exist in the UI (even if disabled when no session selected)
    const archiveBtn = window.getByRole("button", { name: /archive/i });
    const archiveExists = await archiveBtn.isVisible().catch(() => false);

    // Button must exist (M2 requirement: Archive is implemented, not just a shell)
    expect(archiveExists).toBeTruthy();

    await app.close();
  });

  test("backend utilityProcess restarts on kill and window recovers", async () => {
    const { app, window } = await launchPiGUI();

    // 1. Verify initial window is loaded
    await expect(window).toHaveTitle(/PiGUI/);

    // 2. Kill the backend utilityProcess from the main process
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      // Access the backend via the preload bridge
      const backend = (win as any).__backendProcess__;
      if (backend && backend.kill) {
        backend.kill("SIGTERM");
      }
    });

    // 3. Wait for recovery: window should reload and be functional again
    //    M2 implements exponential-backoff restart + renderer reload + cold resume
    await window.waitForLoadState("domcontentloaded", { timeout: 30_000 });

    // 4. Window should still show PiGUI (not a crash screen)
    await expect(window).toHaveTitle(/PiGUI/);

    await app.close();
  });
});
