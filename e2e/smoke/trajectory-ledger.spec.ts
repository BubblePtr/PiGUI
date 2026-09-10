import { test, expect, type Locator } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let baseUrl: string;

test.beforeAll(async () => {
  server = await createServer({
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    plugins: [{
      name: "trajectory-ledger-fixture",
      configureServer(vite) {
        vite.middlewares.use("/ledger-fixture", async (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end(await vite.transformIndexHtml("/ledger-fixture", `
            <html data-astryx-theme="neutral"><body><div id="root" style="height:100vh"></div>
            <script type="module" src="/e2e/fixtures/trajectory-ledger.tsx"></script>
            </body></html>
          `));
        });
      },
    }],
  });
  await server.listen();
  baseUrl = server.resolvedUrls!.local[0];
});

test.afterAll(async () => { await server?.close(); });

async function scrollRunTo(run: Locator, offset: number) {
  await run.evaluate((element, offset) => {
    const scroller = document.querySelector('[data-testid="session-detail-scroll-body"]')!;
    scroller.scrollTop += element.getBoundingClientRect().top
      - scroller.getBoundingClientRect().top - offset;
  }, offset);
}

async function expectHeaderBeforeSteps(run: Locator) {
  await expect.poll(() => run.evaluate((element) => {
    const header = element.querySelector("header")!.getBoundingClientRect();
    const firstRow = element.querySelector('[data-slot="trajectory-ledger-row"]')!
      .getBoundingClientRect();
    return header.bottom - firstRow.top;
  })).toBeLessThanOrEqual(1);
}

// Exercise the page's real virtualizer and CSS: jsdom cannot detect a sticky
// header drifting into its own rows when an ancestor is translated.
test("Run headers stay above entering steps and hand off sticky positioning while scrolling", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${baseUrl}ledger-fixture`);
  const runs = page.locator('[data-slot="trajectory-ledger-run"]');
  await expect(runs).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  const firstRun = runs.nth(0);
  const secondRun = runs.nth(1);
  const scroller = page.getByTestId("session-detail-scroll-body");

  // The next Run is visible but has not reached the sticky edge yet.
  await scrollRunTo(secondRun, 200);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectHeaderBeforeSteps(secondRun);
  await page.screenshot({ path: testInfo.outputPath("entering-run.png") });

  // The incoming header pushes the outgoing one away without crossing it.
  const headerHeight = (await secondRun.locator("header").boundingBox())!.height;
  await scrollRunTo(secondRun, headerHeight / 2);
  await expectHeaderBeforeSteps(secondRun);
  await expect.poll(async () => {
    const previous = (await firstRun.locator("header").boundingBox())!;
    const next = (await secondRun.locator("header").boundingBox())!;
    return previous.y + previous.height - next.y;
  }).toBeLessThanOrEqual(1);

  // Fixing the overlap must preserve the active Run's sticky header.
  await scrollRunTo(secondRun, -100);
  await expect.poll(async () => {
    const header = (await secondRun.locator("header").boundingBox())!;
    const viewport = (await scroller.boundingBox())!;
    return Math.abs(header.y - viewport.y);
  }).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("sticky-run.png") });

  // Reversing direction must restore the header before its rows as well.
  await scrollRunTo(secondRun, 200);
  await expectHeaderBeforeSteps(secondRun);
  const prompt = secondRun.getByRole("button", { name: "user Prompt 2", exact: true });
  await prompt.click();
  await expect(prompt).toHaveAttribute("aria-pressed", "true");
});
