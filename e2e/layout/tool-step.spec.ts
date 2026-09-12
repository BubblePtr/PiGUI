import { expect, test } from "@playwright/test";

for (const width of [320, 560]) {
  test(`failed tool summary stays on one line at ${width}px`, async ({ page }, testInfo) => {
    await page.goto("/#/design");
    await page.getByRole("button", { name: "Components", exact: true }).click();
    await page.getByRole("textbox", { name: "Search components" }).fill("ChatToolStep");
    const row = page.getByTestId("tool-step-failed-long-command");
    await expect(row).toBeVisible();
    // Constrain the real component, not a copy of its markup or CSS.
    await row.evaluate((element, size) => { element.style.width = `${size}px`; }, width);
    await page.evaluate(() => document.fonts.ready);
    const error = row.locator(".chat-step__meta--error");
    const label = row.locator(".chat-step__label");
    const metrics = await error.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return { lines: range.getClientRects().length, text: element.textContent };
    });
    expect(metrics.text).toBe("1 failed");
    expect(metrics.lines).toBe(1);
    expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const trigger = row.locator(".chat-step__trigger");
    expect(await trigger.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await row.screenshot({ path: testInfo.outputPath("single-line-summary.png") });
    await trigger.click();
    await expect(row.getByText("no checks reported on the branch", { exact: true })).toBeVisible();
  });
}
