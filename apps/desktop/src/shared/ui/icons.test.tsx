import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as icons from "@/shared/ui/icons";

/**
 * Smoke test over the whole icon barrel: every export must render an SVG
 * without crashing. Guards against a vendor icon being renamed/removed
 * upstream while the wrapper keeps exporting it.
 */
describe("icons", () => {
  const entries = Object.entries(icons).filter(
    ([, value]) => typeof value === "function",
  ) as [string, React.ComponentType][];

  it("exports at least the icon set the shell depends on", () => {
    expect(entries.length).toBeGreaterThan(20);
  });

  it.each(entries)("%s renders an svg", (_name, Icon) => {
    const { container } = render(<Icon />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
