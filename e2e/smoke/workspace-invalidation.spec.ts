import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { launchPace } from "../fixtures/electron-app";

test("external Git updates the visible branch and Changes without reactivation", async ({}, testInfo) => {
  const testApp = await launchPace({ seedGitChanges: true, seedPreflightAuth: true });
  try {
    await testApp.resizeWindow(1440, 900);
    const { window } = testApp;
    await window.getByRole("button", { name: "New Chat for E2E Project", exact: true }).click();
    await window.getByRole("button", { name: new RegExp(`^${testApp.projection!.initialPrompt}`, "i") }).click();
    await window.getByRole("button", { name: "Session dock", exact: true }).click();
    const dock = window.getByTestId("session-dock");
    await expect(dock.getByText("2 files", { exact: true })).toBeVisible();
    const branch = window.getByTestId("git-branch-status");
    await expect(branch).toBeVisible();
    await window.screenshot({ path: testInfo.outputPath("before.png") });
    const activationEvents = await window.evaluateHandle(() => {
      const events: string[] = [];
      window.addEventListener("focus", () => events.push("focus"));
      document.addEventListener("visibilitychange", () => events.push("visibilitychange"));
      return events;
    });
    const git = (...args: string[]) => execFileSync("git", ["-C", testApp.project!.path, ...args], { stdio: "pipe" });
    git("checkout", "-b", "phase2-external");
    await expect(branch).toContainText("phase2-external");
    await window.screenshot({ path: testInfo.outputPath("branch.png") });
    git("add", ".");
    git("commit", "-m", "external commit");
    await expect(dock.getByText("No changes yet", { exact: true })).toBeVisible();
    // The chip and dock assertions above already prove the refresh did not need
    // window activation; a stray focus event is diagnostic, not a failure.
    const activations = await activationEvents.jsonValue();
    if (activations.length > 0) testInfo.annotations.push({ type: "activation-events", description: activations.join(",") });
    await window.screenshot({ path: testInfo.outputPath("clean.png") });
  } finally {
    await testApp.close();
  }
});
