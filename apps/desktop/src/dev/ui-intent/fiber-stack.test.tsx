import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  componentStackFromFiber,
  definitionSite,
  fiberFromElement,
  innermostComponent,
  nearestTestId,
  relativeSourcePath,
} from "./fiber-stack";

function InnerWidget() {
  return (
    <button data-testid="inner-button" type="button">
      hi
    </button>
  );
}

function OuterWidget() {
  return (
    <section data-testid="outer-section">
      <InnerWidget />
    </section>
  );
}

function renderAndGetStack() {
  render(<OuterWidget />);
  const element = screen.getByTestId("inner-button");
  const fiber = fiberFromElement(element);

  if (!fiber) {
    throw new Error("expected a React fiber on the rendered element");
  }

  return { element, stack: componentStackFromFiber(fiber) };
}

describe("fiberFromElement", () => {
  it("finds the fiber for a React-rendered element", () => {
    render(<OuterWidget />);
    expect(fiberFromElement(screen.getByTestId("inner-button"))).not.toBeNull();
  });

  it("returns null for an element React never rendered", () => {
    expect(fiberFromElement(document.createElement("div"))).toBeNull();
  });
});

describe("componentStackFromFiber", () => {
  it("collects the clicked element first, then components innermost → outermost", () => {
    const { stack } = renderAndGetStack();

    expect(stack[0]).toMatchObject({ name: "button", kind: "element" });

    const names = stack.map((entry) => entry.name);
    expect(names.indexOf("InnerWidget")).toBeGreaterThan(0);
    expect(names.indexOf("InnerWidget")).toBeLessThan(names.indexOf("OuterWidget"));
  });

  it("carries dev source locations (file + line) from the fiber _debugStack", () => {
    const { stack } = renderAndGetStack();

    // jsxDEV injects a "react-stack-top-frame" Error under
    // @vitejs/plugin-react in non-production mode — vitest included.
    expect(stack[0].file).toContain("fiber-stack.test");
    expect(stack[0].line).toBeGreaterThan(0);
  });

  it("innermostComponent returns the first component entry", () => {
    const { stack } = renderAndGetStack();
    expect(innermostComponent(stack)?.name).toBe("InnerWidget");
  });
});

describe("definitionSite", () => {
  it("points into the component's own file", () => {
    const { stack } = renderAndGetStack();
    const inner = stack.find((entry) => entry.name === "InnerWidget");

    if (!inner?.fiber) {
      throw new Error("expected InnerWidget on the stack");
    }

    const site = definitionSite(inner.fiber);
    expect(site.file).toContain("fiber-stack.test");
    expect(site.line).toBeGreaterThan(0);
  });
});

describe("relativeSourcePath", () => {
  it("relativizes repo paths", () => {
    expect(relativeSourcePath("/Users/someone/PiGUI/apps/desktop/src/app/main.tsx")).toEqual({
      path: "apps/desktop/src/app/main.tsx",
      library: false,
    });
  });

  it("flags node_modules sources as library", () => {
    const result = relativeSourcePath(
      "/Users/someone/PiGUI/node_modules/@astryxdesign/core/Button.tsx",
    );
    expect(result).toEqual({ path: "@astryxdesign/core/Button.tsx", library: true });
  });
});

describe("nearestTestId", () => {
  it("prefers the element's own testid, then walks up ancestors", () => {
    const { element } = renderAndGetStack();
    expect(nearestTestId(element)).toBe("inner-button");

    element.removeAttribute("data-testid");
    expect(nearestTestId(element)).toBe("outer-section");
  });
});
