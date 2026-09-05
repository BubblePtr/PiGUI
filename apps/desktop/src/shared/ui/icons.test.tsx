import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatToolKindIcon } from "@/shared/ui/chat/chat-tool-kind";
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

  // `export const File` binds to the host File constructor under some Vite/HMR
  // and Electron transforms. IconsGallery then renders <File />, and React 19
  // throws "Cannot read properties of null (reading 'use')".
  it("does not export File, which collides with the host File constructor", () => {
    expect(Object.prototype.hasOwnProperty.call(icons, "File")).toBe(false);
    expect(icons.FileIcon).not.toBe(globalThis.File);
  });

  // Lucide calls this SquareTerminal; Hugeicons ships it as ComputerTerminal01.
  // The old TerminalIcon is a chevron-and-underscore with no frame.
  it("draws SquareTerminal as the framed console glyph", () => {
    const { container } = render(<icons.SquareTerminal />);
    const paths = [...container.querySelectorAll("path")].map(
      (path) => path.getAttribute("d") ?? "",
    );

    expect(paths.some((d) => d.includes("12 21C15.7497"))).toBe(true);
    expect(paths.some((d) => d.startsWith("M4.00004 17"))).toBe(false);
  });

  it("uses SquareTerminal for the shell tool kind", () => {
    const { container: kind } = render(<ChatToolKindIcon kind="shell" />);
    const { container: square } = render(<icons.SquareTerminal />);

    expect(kind.querySelector("svg")?.innerHTML).toBe(
      square.querySelector("svg")?.innerHTML,
    );
  });

  it.each(entries)("%s renders an svg", (_name, Icon) => {
    const { container } = render(<Icon />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("does not share identity with a same-named host constructor", () => {
    for (const [name, Icon] of entries) {
      const host = (globalThis as Record<string, unknown>)[name];

      if (typeof host === "function") {
        expect(Icon).not.toBe(host);
      }
    }
  });
});
