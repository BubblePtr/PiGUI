import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { launchPiGUI } from "../fixtures/electron-app";

/**
 * Browser surface smoke: drives the real `WebContentsView` the Electron main
 * process owns. The view's contents are reachable as a Playwright Page (S0
 * spike), so the embedded page is asserted directly rather than through a
 * screenshot.
 *
 * Everything inside the view is driven by script rather than by synthesized
 * input: the native child view is outside the renderer's hit-test tree, so
 * Playwright's actionability checks have nothing to resolve against.
 *
 * The URL allowlist is not exercised here — Chromium refuses `file:` from an
 * http page before our handler ever sees it, so an E2E assertion would pass
 * whether or not the guard exists. It is unit-tested at every layer that can
 * actually reach it.
 */

const pageBody = `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview target</title></head>
<body>
  <h1 id="home">PiGUI preview home</h1>
  <a href="/next" id="popup" target="_blank">Open next</a>
</body></html>`;

const nextBody = `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview next</title></head>
<body><h1 id="next">PiGUI preview next</h1></body></html>`;

function startPreviewServer() {
  return new Promise<{ server: Server; origin: string }>((resolve) => {
    const server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(request.url === "/next" ? nextBody : pageBody);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      resolve({ server, origin: `127.0.0.1:${port}` });
    });
  });
}

/** The embedded view is the last web-contents child added to the window. */
async function readBrowserViewWidth(app: ElectronApplication) {
  const widths = await app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]?.contentView.children ?? [])
      .filter((child): child is Electron.WebContentsView => "webContents" in child)
      .map((child) => child.getBounds().width),
  );

  return widths.at(-1) ?? 0;
}

test("Browser surface loads a page, follows the panel, and keeps popups in place", async () => {
  const { server, origin } = await startPreviewServer();
  const testApp = await launchPiGUI({ seedSession: true, seedPreflightAuth: true });

  try {
    await testApp.resizeWindow(1440, 900);

    const { window } = testApp;

    await window.getByRole("button", { name: "New Session", exact: true }).click();
    await window
      .getByRole("button", {
        name: new RegExp(`^${testApp.projection!.initialPrompt}`, "i"),
      })
      .click();
    await window.getByLabel("Session inspector").click();

    const aside = window.getByTestId("session-inspector");

    await expect(aside).toBeVisible();
    await aside.getByRole("button", { name: "Browser" }).click();

    // No URL remembered for this Project yet.
    await expect(aside.getByText("No page loaded")).toBeVisible();

    const viewPage = testApp.app.waitForEvent("window");

    await aside.getByRole("textbox", { name: "Address" }).fill(origin);
    await window.keyboard.press("Enter");

    const embedded: Page = await viewPage;

    await expect(embedded.locator("#home")).toHaveText("PiGUI preview home");

    // Resizing the panel moves the native view: its bounds are the renderer
    // placeholder's rect, so the two must still agree afterwards.
    const widthBeforeResize = await readBrowserViewWidth(testApp.app);

    await window.getByRole("separator", { name: "Resize Session inspector" }).focus();
    for (let step = 0; step < 12; step += 1) {
      await window.keyboard.press("ArrowLeft");
    }

    await expect
      .poll(() => readBrowserViewWidth(testApp.app))
      .not.toBe(widthBeforeResize);

    const placeholder = (await window.getByTestId("browser-viewport").boundingBox())!;

    expect(await readBrowserViewWidth(testApp.app)).toBeCloseTo(placeholder.width, 0);

    // `_blank` never opens a window; it loads in this same view.
    await embedded
      .evaluate(() => document.getElementById("popup")!.click())
      // The click's own round-trip dies with the execution context the
      // navigation replaces; the assertion below is the real wait.
      .catch(() => undefined);
    await expect(embedded.locator("#next")).toHaveText("PiGUI preview next");
    expect(testApp.app.windows()).toHaveLength(2);
  } finally {
    await testApp.close();
    server.close();
  }
});
