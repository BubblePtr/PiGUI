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
    expect(html).toContain("family=Montserrat:wght@100..900");
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

  it("wires Astryx base styles and theme before the app renders", () => {
    const main = readFileSync(
      join(repoRoot, "apps/desktop/src/app/main.tsx"),
      "utf8",
    );
    const styles = readFileSync(
      join(repoRoot, "apps/desktop/src/app/styles.css"),
      "utf8",
    );

    // Cascade-layer order is pinned explicitly: Astryx layers must outrank
    // Tailwind preflight (base) or Astryx paddings get zeroed, yet stay below
    // HeroUI's components/utilities or HeroUI controls lose their styling.
    expect(styles).toContain(
      "@layer theme, base, properties, reset, astryx-base, astryx-theme, components, utilities;",
    );
    expect(styles.indexOf("@layer theme,")).toBe(0);
    expect(main).not.toContain("@astryxdesign/core/reset.css");
    expect(styles.indexOf('@import "tailwindcss";')).toBeLessThan(
      styles.indexOf('@import "@astryxdesign/core/reset.css";'),
    );
    expect(styles.indexOf('@import "@astryxdesign/core/reset.css";')).toBeLessThan(
      styles.indexOf('@import "@astryxdesign/core/astryx.css";'),
    );
    expect(styles.indexOf('@import "@astryxdesign/core/astryx.css";')).toBeLessThan(
      styles.indexOf('@import "@astryxdesign/theme-neutral/theme.css";'),
    );
    expect(main).toContain('from "@astryxdesign/theme-neutral/built"');
    expect(main).toContain("<Theme theme={neutralTheme}>");
  });

  it("keeps Astryx surfaces on the theme's default font stack", () => {
    const styles = readFileSync(join(repoRoot, "apps/desktop/src/app/styles.css"), "utf8");

    expect(styles).not.toContain("--font-family-body:");
    expect(styles).not.toContain("--font-family-heading:");
  });

  it("maps the HeroUI sans font token to Montserrat", () => {
    const styles = readFileSync(join(repoRoot, "apps/desktop/src/app/styles.css"), "utf8");

    expect(styles).toContain('--font-montserrat: "Montserrat", sans-serif;');
    expect(styles).toContain('--font-inter: "Inter", sans-serif;');
    expect(styles).toContain("--font-sans: var(--font-montserrat);");
    expect(styles).toContain('[data-theme="default"]');
  });

  it("keeps app typography at normal weight without session-title exceptions", () => {
    const styles = readFileSync(join(repoRoot, "apps/desktop/src/app/styles.css"), "utf8");

    expect(styles).toContain(".pigui-app-layout :where(*)");
    expect(styles).not.toContain("data-pigui-session-title");
    expect(styles).toContain(".pigui-app-layout .astryx-side-nav-section span");
    expect(styles).toContain(
      '.pigui-app-layout .astryx-side-nav-item[data-selected="selected"]',
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
