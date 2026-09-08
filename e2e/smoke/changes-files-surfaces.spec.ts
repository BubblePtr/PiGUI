import { expect, test, type Page } from "@playwright/test";
import { launchPiGUI } from "../fixtures/electron-app";

/**
 * Changes + Files surface smoke (ADR-0035): the real backend reads the seeded
 * Git checkout, every diff is stacked in Changes, and the Files surface walks
 * the same checkout and previews a file through the renderer.
 */
async function openSeededSession(window: Page, title: string) {
  await window.getByRole("button", { name: "New Chat for E2E Project", exact: true }).click();
  await expect(window.getByRole("textbox")).toBeVisible();

  const session = window.getByRole("button", { name: new RegExp(`^${title}`, "i") });

  await expect(session).toBeVisible();
  await session.click();
  await window.getByRole("button", { name: "Session dock", exact: true }).click();
}

test("Changes stacks every diff; Files browses and previews the checkout", async ({}, testInfo) => {
  const testApp = await launchPiGUI({ seedGitChanges: true, seedPreflightAuth: true });

  try {
    await testApp.resizeWindow(1440, 900);

    const { window } = testApp;

    await openSeededSession(window, testApp.projection!.initialPrompt);

    const dock = window.getByTestId("session-dock");

    await expect(dock).toBeVisible();

    // Changes: both files are open at once, no click needed to see either diff.
    await expect(dock.getByText("2 files", { exact: true })).toBeVisible();
    await expect(dock.getByTestId("session-change-section")).toHaveCount(2);
    await expect(
      dock.getByText('export const state = "after";', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      dock.getByText("export const enabled = true;", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await window.screenshot({ path: testInfo.outputPath("changes-stacked.png") });

    await dock.getByRole("button", { name: "Collapse all", exact: true }).click();
    await expect(
      dock.getByText('export const state = "after";', { exact: true }),
    ).toHaveCount(0);
    await expect(dock.getByRole("button", { name: "Expand all", exact: true })).toBeVisible();

    // Files: the tree is rooted at the checkout, directories load on demand,
    // and a file renders through the code renderer.
    await dock.getByRole("button", { name: "Files", exact: true }).click();
    await expect(window.getByRole("region", { name: "Session files" })).toBeVisible();

    const tree = window.getByRole("region", { name: "Session files" });

    await expect(tree.getByText("src", { exact: true })).toBeVisible();
    await tree.getByText("src", { exact: true }).click();
    await tree.getByText("app.ts", { exact: true }).click();
    await expect(
      tree.getByText('export const state = "after";', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(window.getByTestId("session-surface-bar")).toContainText("src/app.ts");
    await window.screenshot({ path: testInfo.outputPath("files-preview.png") });
  } finally {
    await testApp.close();
  }
});
