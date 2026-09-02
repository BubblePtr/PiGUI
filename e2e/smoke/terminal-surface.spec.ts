import { expect, test } from "@playwright/test";
import { launchPiGUI } from "../fixtures/electron-app";

/**
 * Terminal surface smoke: drives a real zsh through the utilityProcess backend
 * (node-pty over the RPC bridge) and back into xterm.js. Covers spawn, the
 * input/output round-trip, a second instance, and scrollback replay on tab
 * switch. xterm renders text into .xterm-rows DOM, so no canvas reading is
 * needed.
 */
test("Terminal surface runs a real shell, multi-instance, with replay", async () => {
  const testApp = await launchPiGUI({ seedSession: true, seedPreflightAuth: true });

  try {
    await testApp.resizeWindow(1440, 900);

    const { window } = testApp;
    const newSession = window.getByRole("button", { name: "New Session", exact: true });

    await expect(newSession).toBeVisible();
    await newSession.click();

    const session = window.getByRole("button", {
      name: new RegExp(`^${testApp.projection!.initialPrompt}`, "i"),
    });

    await expect(session).toBeVisible();
    await session.click();

    // Open the inspector docked, then switch the rail to Terminal.
    const inspectorToggle = window.getByLabel("Session inspector");

    await expect(inspectorToggle).toBeVisible();
    await inspectorToggle.click();

    const aside = window.getByTestId("session-inspector");

    await expect(aside).toBeVisible();
    await aside.getByRole("button", { name: "Terminal" }).click();

    // The first shell is created automatically; wait for the prompt to paint.
    const viewport = window.getByTestId("terminal-viewport");
    const rows = viewport.locator(".xterm-rows");

    await expect(aside.getByRole("tab", { name: "Terminal 1" })).toBeVisible();
    await expect(rows).not.toHaveText(/^\s*$/, { timeout: 15_000 });

    // Input round-trip: type into xterm, the shell echoes the result back.
    await viewport.click();
    await window.keyboard.type("echo E2E_PTY_ONE");
    await window.keyboard.press("Enter");
    await expect(rows).toContainText("E2E_PTY_ONE");

    // A second instance gets its own shell; output stays independent.
    await aside.getByRole("button", { name: "New terminal" }).click();

    const secondTab = aside.getByRole("tab", { name: "Terminal 2" });

    await expect(secondTab).toBeVisible();
    await viewport.click();
    await window.keyboard.type("echo E2E_PTY_TWO");
    await window.keyboard.press("Enter");
    await expect(rows).toContainText("E2E_PTY_TWO");
    await expect(rows).not.toContainText("E2E_PTY_ONE");

    // Switching back re-attaches and replays the first shell's scrollback.
    await aside.getByRole("tab", { name: "Terminal 1" }).click();
    await expect(rows).toContainText("E2E_PTY_ONE");

    // Closing the second tab leaves the first alive.
    await aside.getByRole("button", { name: "Close Terminal 2" }).click();
    await expect(secondTab).toHaveCount(0);
    await expect(rows).toContainText("E2E_PTY_ONE");
  } finally {
    await testApp.close();
  }
});
