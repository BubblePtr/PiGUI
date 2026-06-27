import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const vendoredHeroUIProPath = ["vendor", "herouipro-v3"].join("/");

describe("HeroUI Pro theme integration", () => {
  it("enables the glass theme at the document root", () => {
    const html = readFileSync(join(repoRoot, "index.html"), "utf8");

    expect(html).toContain('data-theme="glass-light"');
  });

  it("imports glass theme CSS and maps Pig tokens to HeroUI tokens", () => {
    const styles = readFileSync(join(repoRoot, "src/styles.css"), "utf8");

    expect(styles).toContain('@import "@heroui-pro/react/css";');
    expect(styles).not.toContain(vendoredHeroUIProPath);
    expect(styles).toContain("--pig-color-background: var(--background)");
    expect(styles).toContain("--pig-color-surface: var(--surface)");
    expect(styles).toContain("--pig-color-border: var(--border)");
  });
});
