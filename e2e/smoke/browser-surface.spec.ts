import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { launchPiGUI, type PiGUITestApplication } from "../fixtures/electron-app";

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

/**
 * Replaces itself while still parsing, which is what baidu.com does on load:
 * Electron rejects the original `loadURL` with ERR_ABORTED even though the
 * page the user ends up on loaded fine.
 */
const replacingBody = `<!doctype html>
<html><head><meta charset="utf-8"><title>Redirecting</title></head>
<body>
  <script>location.replace("/next");</script>
  <img src="/slow.png" alt="" />
</body></html>`;

/**
 * The page the annotation layer has to survive: everything denied but the
 * document itself, which is what a real app with a tight CSP looks like. The
 * overlay may not use a `<style>` element or `innerHTML` on such a page.
 */
const strictCspBody = `<!doctype html>
<html><head><meta charset="utf-8"><title>Strict CSP</title></head>
<body><h1 id="csp-home">Strict CSP preview</h1><button id="cta">Mark me</button></body></html>`;

function startPreviewServer() {
  return new Promise<{ server: Server; origin: string }>((resolve) => {
    const server = createServer((request, response) => {
      if (request.url === "/csp") {
        response.writeHead(200, {
          "content-type": "text/html",
          "content-security-policy": "default-src 'none'; script-src 'self'",
        });
        response.end(strictCspBody);
        return;
      }

      response.writeHead(200, { "content-type": "text/html" });
      if (request.url === "/next") {
        response.end(nextBody);
        return;
      }
      if (request.url === "/slow.png") {
        // Never answered: the replacing document's load event stays pending,
        // so the navigation the address bar asked for is still in flight when
        // the page replaces it — which is what produces ERR_ABORTED.
        return;
      }
      response.end(request.url === "/replacing" ? replacingBody : pageBody);
    });

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      resolve({ server, origin: `127.0.0.1:${port}` });
    });
  });
}

/** The embedded view is the last web-contents child added to the window. */
async function readBrowserViewVisible(app: ElectronApplication) {
  const visible = await app.evaluate(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]?.contentView.children ?? [])
      .filter((child): child is Electron.WebContentsView => "webContents" in child)
      .map((child) => child.getVisible()),
  );

  return visible[visible.length - 1] ?? false;
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

/** Opens the inspector on the Browser surface, with no page loaded yet. */
async function openBrowserSurface(testApp: PiGUITestApplication) {
  const { window } = testApp;

  await testApp.resizeWindow(1440, 900);
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

  return aside;
}

test("Browser surface loads a page, follows the panel, and keeps popups in place", async () => {
  const { server, origin } = await startPreviewServer();
  const testApp = await launchPiGUI({ seedSession: true, seedPreflightAuth: true });

  try {
    const { window } = testApp;
    const aside = await openBrowserSurface(testApp);

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

    // Hovering the rail opens a tooltip the native view would paint over. In
    // Chromium the layer opens through `showPopover()`, which mutates no
    // attribute and moves no node — the Popover API's `toggle` event is the
    // only signal, and jsdom has no Popover API at all, so this is the one
    // place the production detection path can be proven.
    expect(await readBrowserViewVisible(testApp.app)).toBe(true);

    // Hovered on each attempt rather than once: a tooltip opens on a pointer
    // that arrives and stays, and a single hover dispatched while the panel is
    // still settling can land where the button is about to be — after which no
    // amount of waiting produces a layer, because nothing is pointing at it.
    await expect
      .poll(async () => {
        await aside.getByRole("button", { name: "Changes" }).hover();

        return window.getByTestId("browser-snapshot").count();
      })
      .toBeGreaterThan(0);
    await expect(window.getByTestId("browser-snapshot")).toBeVisible();
    await expect.poll(() => readBrowserViewVisible(testApp.app)).toBe(false);

    // Moving off the rail hands the live view back.
    await window.getByTestId("browser-viewport").hover();
    await expect(window.getByTestId("browser-snapshot")).toHaveCount(0);
    await expect.poll(() => readBrowserViewVisible(testApp.app)).toBe(true);

    // A page that replaces itself mid-load aborts the request the address bar
    // asked for. The page is fine, so the surface must not flip to its error
    // state over a page that is on screen and working.
    await aside.getByRole("textbox", { name: "Address" }).fill(`${origin}/replacing`);
    await window.keyboard.press("Enter");
    await expect(embedded.locator("#next")).toHaveText("PiGUI preview next");
    await expect(window.getByTestId("browser-viewport")).toBeVisible();
    await expect(window.getByText("The page did not load")).toHaveCount(0);

    await aside.getByRole("textbox", { name: "Address" }).fill(origin);
    await window.keyboard.press("Enter");
    await expect(embedded.locator("#home")).toHaveText("PiGUI preview home");

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

test("Design mode marks a strict-CSP page, keeps the overlay to itself, and sends the marks to the composer", async () => {
  const { server, origin } = await startPreviewServer();
  const testApp = await launchPiGUI({ seedSession: true, seedPreflightAuth: true });

  try {
    const { window } = testApp;
    const aside = await openBrowserSurface(testApp);
    const viewPage = testApp.app.waitForEvent("window");

    await aside.getByRole("textbox", { name: "Address" }).fill(`${origin}/csp`);
    await window.keyboard.press("Enter");

    const embedded: Page = await viewPage;

    await expect(embedded.locator("#csp-home")).toHaveText("Strict CSP preview");
    expect(await readBrowserViewVisible(testApp.app)).toBe(true);

    await aside.getByRole("button", { name: "Design" }).click();

    // The toolbar is plain buttons on purpose: a layer would trip the overlay
    // detection and the user would end up marking a frozen screenshot.
    await expect(window.getByTestId("browser-snapshot")).toHaveCount(0);
    expect(await readBrowserViewVisible(testApp.app)).toBe(true);

    // The host element showing up is design mode actually reaching the page —
    // it is the one part of the overlay the page can see.
    await expect
      .poll(() =>
        embedded.evaluate(() =>
          Boolean(document.querySelector("pigui-annotation-overlay")),
        ),
      )
      .toBe(true);

    // Synthesized input cannot reach a native child view, so the page marks
    // itself; the isolated world's listener still sees the click (S0 spike).
    await embedded.evaluate(() => document.getElementById("cta")!.click());

    await expect(aside.getByTestId("browser-annotation-count")).toHaveText("1 marked");

    // Everything the overlay draws stays behind a closed shadow root: the page
    // can find the host and delete it, but never read what is inside.
    expect(
      await embedded.evaluate(() => {
        const host = document.querySelector("pigui-annotation-overlay");

        return {
          hostFound: Boolean(host),
          shadowReadable: host ? host.shadowRoot !== null : true,
          leaksOverlayText: document.documentElement.innerHTML.includes(
            "What is wrong here?",
          ),
        };
      }),
    ).toEqual({ hostFound: true, shadowReadable: false, leaksOverlayText: false });

    // What design mode is for: the marks and a screenshot of them land in this
    // Session's composer as a draft, never as a sent prompt.
    await aside.getByRole("button", { name: "Send to composer" }).click();

    const composer = window.getByTestId("full-chat-composer");

    // No comment was typed — the bubble lives in the closed shadow root, out of
    // reach of any driver — so this also covers the uncommented row.
    await expect(composer.getByRole("textbox")).toHaveValue(
      /#1 `#cta` \(button\) — \(no comment\)/,
    );
    await expect(composer.getByAltText("browser-annotations.png")).toBeVisible();

    // Escape inside the page leaves design mode, and the toolbar follows.
    await embedded.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );

    await expect(aside.getByRole("button", { name: "Design" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await aside.getByRole("button", { name: "Clear marks" }).click();
    await expect(aside.getByTestId("browser-annotation-count")).toHaveCount(0);
  } finally {
    await testApp.close();
    server.close();
  }
});
