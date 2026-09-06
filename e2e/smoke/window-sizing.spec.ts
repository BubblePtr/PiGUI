import { expect, test } from "@playwright/test";
import { launchPiGUI } from "../fixtures/electron-app";

test("macOS E2E windows can exceed the runner display height", async () => {
  test.skip(process.platform !== "darwin", "macOS constrains native window sizes");
  const application = await launchPiGUI();

  try {
    const requestedHeight = await application.app.evaluate(
      ({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        const display = screen.getDisplayMatching(window.getBounds());
        const height = Math.max(900, display.bounds.height + 100);
        window.setSize(1280, height);
        return height;
      },
    );

    await expect.poll(() => application.app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize()[1],
    )).toBe(requestedHeight);
  } finally {
    await application.close();
  }
});
