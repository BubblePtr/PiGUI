import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const vendoredHeroUIProPath = ["vendor", "herouipro-v3"].join("/");

describe("HeroUI Pro theme integration", () => {
  it("uses the default theme at the document root", () => {
    const html = readFileSync(join(repoRoot, "index.html"), "utf8");

    expect(html).not.toContain("data-theme=");
    expect(html).not.toContain("glass-light");
  });

  it("uses HeroUI package theme CSS without Pro theme variants or Pig token remapping", () => {
    const styles = readFileSync(join(repoRoot, "src/styles.css"), "utf8");

    expect(styles).toContain('@import "@heroui-pro/react/css";');
    expect(styles).not.toContain('@import "@heroui-pro/react/themes/glass";');
    expect(styles).not.toContain(vendoredHeroUIProPath);
    expect(styles).not.toContain("--pig-color-");
    expect(styles).not.toContain("--pig-surface-");
    expect(styles).not.toContain("@theme inline");
    expect(styles).not.toContain("--color-background: var(--pig-");
  });

  it("does not override default HeroUI shell surfaces", () => {
    const styles = readFileSync(join(repoRoot, "src/styles.css"), "utf8");

    expect(styles).not.toContain(".pig-app-layout [data-slot=\"app-layout-body\"]");
    expect(styles).not.toContain("background-color: var(--surface);");
    expect(styles).not.toContain("box-shadow: var(--surface-shadow);");
    expect(styles).not.toContain("--background-gradient");
    expect(styles).not.toContain("--glass-blur");
    expect(styles).not.toContain("backdrop-filter");
  });
});
