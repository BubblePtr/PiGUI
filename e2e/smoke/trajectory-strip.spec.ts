import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

let server: ViteDevServer;
let baseUrl: string;

test.beforeAll(async () => {
  server = await createServer({
    server: { host: "127.0.0.1", port: 0, strictPort: false },
    plugins: [{
      name: "trajectory-strip-fixture",
      configureServer(vite) {
        vite.middlewares.use("/strip-fixture", async (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end(await vite.transformIndexHtml("/strip-fixture", `
            <html><body><div id="root"></div>
            <script type="module" src="/e2e/fixtures/trajectory-strip.tsx"></script>
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

// A real layout engine is required: jsdom cannot catch cumulative flex overflow.
for (const width of [320, 640, 1280]) {
  for (const mode of ["steps", "duration"]) {
    test(`Strip fits ${width}px in ${mode} mode and keeps its final segment selectable`, async ({ page }) => {
      for (const count of [4, 727]) {
        await page.setViewportSize({ width, height: 300 });
        await page.goto(`${baseUrl}strip-fixture?count=${count}&mode=${mode}`);
        const columns = page.locator("[data-strip-col]");
        await expect(columns).toHaveCount(count);
        const track = page.getByRole("listbox");
        await expect.poll(() => track.evaluate((element) => {
          const right = element.getBoundingClientRect().right;
          const columns = Array.from(element.querySelectorAll("[data-strip-col]"));
          return Math.max(element.scrollWidth - element.clientWidth,
            ...columns.map((column) => column.getBoundingClientRect().right - right));
        })).toBeLessThanOrEqual(1);
        await columns.last().click();
        await expect(page.locator("body")).toHaveAttribute("data-selected", `t${count - 1}-s0`);
      }
    });
  }
}
