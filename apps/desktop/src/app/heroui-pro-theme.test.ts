import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const vendoredHeroUIProPath = ["vendor", "herouipro-v3"].join("/");

describe("HeroUI Pro theme integration", () => {
  it("uses the default theme at the document root", () => {
    const html = readFileSync(join(repoRoot, "apps/desktop/index.html"), "utf8");

    expect(html).not.toContain("data-theme=");
    expect(html).not.toContain("glass-light");
  });

  it("loads the UI font families before the renderer starts", () => {
    const html = readFileSync(join(repoRoot, "apps/desktop/index.html"), "utf8");

    expect(html).toContain("https://fonts.googleapis.com");
    expect(html).toContain("family=Varela+Round");
    expect(html).toContain("family=Inter:wght@100..900");
  });

  it("uses HeroUI package theme CSS without Pro theme variants or Pig token remapping", () => {
    const styles = readFileSync(join(repoRoot, "apps/desktop/src/app/styles.css"), "utf8");

    expect(styles).toContain('@import "@heroui-pro/react/css";');
    expect(styles).not.toContain('@import "@heroui-pro/react/themes/glass";');
    expect(styles).not.toContain(vendoredHeroUIProPath);
    expect(styles).not.toContain("--pigui-color-");
    expect(styles).not.toContain("--pigui-surface-");
    expect(styles).not.toContain("@theme inline");
    expect(styles).not.toContain("--color-background: var(--pigui-");
  });

  it("maps the HeroUI sans font token to Varela Round", () => {
    const styles = readFileSync(join(repoRoot, "apps/desktop/src/app/styles.css"), "utf8");

    expect(styles).toContain('--font-varela-round: "Varela Round", sans-serif;');
    expect(styles).toContain('--font-inter: "Inter", sans-serif;');
    expect(styles).toContain("--font-sans: var(--font-varela-round);");
    expect(styles).toContain('[data-theme="default"]');
  });

  it("keeps app typography at normal weight without session-title exceptions", () => {
    const styles = readFileSync(join(repoRoot, "apps/desktop/src/app/styles.css"), "utf8");

    expect(styles).toContain(".pigui-app-layout :where(*)");
    expect(styles).not.toContain("data-pigui-session-title");
    expect(styles).toContain(".pigui-app-layout .sidebar__group-label");
    expect(styles).toContain(".pigui-app-layout .sidebar__menu-header");
    expect(styles).toContain(
      '.pigui-app-layout .sidebar__menu-item[data-current="true"] .sidebar__menu-label',
    );
    expect(styles).toContain("font-weight: var(--font-weight-normal, 400);");
    expect(styles).not.toContain("font-weight: var(--font-weight-semibold, 600);");
  });

  it("does not override default HeroUI shell surfaces", () => {
    const styles = readFileSync(join(repoRoot, "apps/desktop/src/app/styles.css"), "utf8");

    expect(styles).not.toContain(".pigui-app-layout [data-slot=\"app-layout-body\"]");
    expect(styles).not.toContain("background-color: var(--surface);");
    expect(styles).not.toContain("box-shadow: var(--surface-shadow);");
    expect(styles).not.toContain("--background-gradient");
    expect(styles).not.toContain("--glass-blur");
    expect(styles).not.toContain("backdrop-filter");
  });
});
