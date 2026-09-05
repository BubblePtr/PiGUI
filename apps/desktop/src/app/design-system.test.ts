import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";

const desktopRequire = createRequire(
  join(process.cwd(), "apps/desktop/package.json"),
);

const repoRoot = process.cwd();

function sourceFilesUnder(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const childPath = join(path, entry);
    const childStat = statSync(childPath);

    if (childStat.isDirectory()) {
      return sourceFilesUnder(childPath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [childPath] : [];
  });
}

function resolveLocalFontPath(fromFile: string, fontUrl: string): string {
  if (isAbsolute(fontUrl) || fontUrl.startsWith(".")) {
    return join(dirname(fromFile), fontUrl);
  }

  return desktopRequire.resolve(fontUrl);
}

describe("Design system integration", () => {
  it("carries no HeroUI imports or stylesheets anywhere in the desktop app", () => {
    // Assembled so this guard doesn't match its own source.
    const herouiPackageScope = ["@hero", "ui"].join("");
    const sourceFiles = sourceFilesUnder(join(repoRoot, "apps/desktop/src"));
    const filesWithHeroUI = sourceFiles.filter((file) =>
      readFileSync(file, "utf8").includes(herouiPackageScope),
    );
    const styles = readFileSync(
      join(repoRoot, "apps/desktop/src/app/styles.css"),
      "utf8",
    );
    const packageJson = readFileSync(join(repoRoot, "package.json"), "utf8");

    expect(filesWithHeroUI).toEqual([]);
    expect(styles).not.toContain(herouiPackageScope);
    expect(packageJson).not.toContain(herouiPackageScope);
  });

  it("uses the default theme at the document root without webfont links", () => {
    const html = readFileSync(join(repoRoot, "apps/desktop/index.html"), "utf8");

    // Assembled so this guard doesn't match its own source.
    const googleFontsHost = ["fonts", "googleapis", "com"].join(".");
    const googleFontsStaticHost = ["fonts", "gstatic", "com"].join(".");

    expect(html).not.toContain("data-theme=");
    expect(html).not.toContain(googleFontsHost);
    expect(html).not.toContain(googleFontsStaticHost);
  });

  it("keeps the whole app on the Astryx body font stack", () => {
    const styles = readFileSync(
      join(repoRoot, "apps/desktop/src/app/styles.css"),
      "utf8",
    );

    expect(styles).toContain("--font-sans: var(--font-family-body);");
    expect(styles).not.toContain("Montserrat");
    expect(styles).not.toContain("Inter");
    // Astryx surfaces keep the theme's own stack: no body/heading overrides.
    expect(styles).not.toContain("--font-family-body:");
    expect(styles).not.toContain("--font-family-heading:");
  });

  it("ships Figtree as a local woff2 so the Astryx stack resolves offline", () => {
    const stylesPath = join(repoRoot, "apps/desktop/src/app/styles.css");
    const styles = readFileSync(stylesPath, "utf8");
    const figtreeFaces = [
      ...styles.matchAll(/@font-face\s*\{([\s\S]*?)\}/g),
    ].filter((match) => /font-family:\s*["']?Figtree["']?\s*;/.test(match[1]));

    expect(figtreeFaces.length).toBeGreaterThan(0);

    const woff2Urls = figtreeFaces.flatMap((match) =>
      [...match[1].matchAll(/url\((['"]?)([^)'"]+\.woff2)\1\)/g)].map(
        (urlMatch) => urlMatch[2],
      ),
    );

    expect(woff2Urls.length).toBeGreaterThan(0);

    for (const fontUrl of woff2Urls) {
      expect(fontUrl).not.toMatch(/^https?:\/\//);
      expect(existsSync(resolveLocalFontPath(stylesPath, fontUrl))).toBe(true);
    }

    expect(styles).not.toContain(["fonts", "googleapis", "com"].join("."));
    expect(styles).not.toContain(["fonts", "gstatic", "com"].join("."));
  });

  it("bridges the PiGUI semantic tokens onto Astryx first-level tokens", () => {
    const styles = readFileSync(
      join(repoRoot, "apps/desktop/src/app/styles.css"),
      "utf8",
    );

    // Bridge must re-resolve inside the Astryx theme scope, not only :root.
    expect(styles).toContain(":root,\n[data-astryx-theme] {");
    expect(styles).toContain("--foreground: var(--color-text-primary);");
    expect(styles).toContain("--muted: var(--color-text-secondary);");
    expect(styles).toContain("--separator: var(--color-border);");
    expect(styles).toContain("--primary: var(--color-accent);");
    expect(styles).toContain("--danger: var(--color-error);");
    expect(styles).toContain("--radius: var(--radius-element);");
    // Tailwind utilities are generated inline from the bridge.
    expect(styles).toContain("@theme inline {");
    expect(styles).toContain("--color-foreground: var(--foreground);");
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
    // Tailwind preflight (base) or Astryx paddings get zeroed, while our
    // components/utilities layers stay on top for app-level overrides.
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

  it("flattens side nav weight only, never the whole app layout", () => {
    const styles = readFileSync(
      join(repoRoot, "apps/desktop/src/app/styles.css"),
      "utf8",
    );

    // The HeroUI-era rule sat on the layout root and erased markdown bold and
    // Tailwind font-medium everywhere; the normalization belongs to the nav.
    expect(styles).toContain(".pigui-app-layout .astryx-side-nav :where(*)");
    expect(styles).not.toMatch(/\.pigui-app-layout :where\(\*\)/);
    expect(styles).not.toContain("data-pigui-session-title");
    expect(styles).toContain(".pigui-app-layout .astryx-side-nav-section span");
    expect(styles).toContain(
      '.pigui-app-layout .astryx-side-nav-item[data-selected="selected"]',
    );
    expect(styles).toContain("font-weight: var(--font-weight-normal, 400);");
    expect(styles).not.toContain("font-weight: var(--font-weight-semibold, 600);");
  });

  it("uses Hugeicons as the renderer icon source", () => {
    const packageJson = readFileSync(join(repoRoot, "package.json"), "utf8");
    const sourceFiles = sourceFilesUnder(join(repoRoot, "apps/desktop/src"));
    const previousIconPackage = ["lucide", "react"].join("-");
    const filesWithLucide = sourceFiles.filter((file) =>
      readFileSync(file, "utf8").includes(previousIconPackage),
    );

    expect(filesWithLucide).toEqual([]);
    expect(packageJson).toContain('"@hugeicons/react"');
    expect(packageJson).toContain('"@hugeicons/core-free-icons"');
    expect(packageJson).not.toContain(previousIconPackage);
  });

  it("renders Hugeicons with the PiGUI stroke weight", () => {
    const source = readFileSync(
      join(repoRoot, "apps/desktop/src/shared/ui/icons.tsx"),
      "utf8",
    );

    expect(source).toContain("const piguiIconStrokeWidth = 1.5;");
    expect(source).toContain("strokeWidth={piguiIconStrokeWidth}");
    expect(source).not.toContain("strokeWidth={2}");
  });
});
