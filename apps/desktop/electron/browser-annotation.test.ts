import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptBrowserAnnotationMessage,
  buildElementSelector,
  describeAnnotatedElement,
} from "./browser-annotation";

function mount(html: string) {
  document.body.innerHTML = html;
}

/** The one property every selector must have, whatever strategy produced it. */
function resolvesUniquelyTo(selector: string, element: Element) {
  const matches = document.querySelectorAll(selector);

  return matches.length === 1 && matches[0] === element;
}

describe("buildElementSelector", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers the element's own id", () => {
    mount('<main><button id="cta">Go</button></main>');

    const element = document.getElementById("cta")!;

    expect(buildElementSelector(element)).toBe("#cta");
    expect(resolvesUniquelyTo(buildElementSelector(element), element)).toBe(true);
  });

  it("escapes an id that is not a bare CSS identifier", () => {
    mount('<main><button id="2:col.x">Go</button></main>');

    const element = document.querySelector("button")!;

    expect(resolvesUniquelyTo(buildElementSelector(element), element)).toBe(true);
  });

  it("skips a duplicated id, which cannot identify anything", () => {
    mount('<p id="dup">first</p><p id="dup" data-testid="second">second</p>');

    const element = document.querySelectorAll("p")[1]!;
    const selector = buildElementSelector(element);

    expect(selector).not.toContain("#dup");
    expect(resolvesUniquelyTo(selector, element)).toBe(true);
  });

  it("uses data-testid when there is no usable id", () => {
    mount('<form><input data-testid="email" /></form>');

    const element = document.querySelector("input")!;

    expect(buildElementSelector(element)).toBe('[data-testid="email"]');
    expect(resolvesUniquelyTo(buildElementSelector(element), element)).toBe(true);
  });

  it("falls back to an nth-of-type chain anchored at the nearest identified ancestor", () => {
    mount('<section id="list"><ul><li>a</li><li>b</li><li>c</li></ul></section>');

    const element = document.querySelectorAll("li")[1]!;
    const selector = buildElementSelector(element);

    expect(selector.startsWith("#list")).toBe(true);
    expect(resolvesUniquelyTo(selector, element)).toBe(true);
  });

  it("reaches an element with no identified ancestor at all", () => {
    mount("<div><span>a</span><span>b</span></div>");

    const element = document.querySelectorAll("span")[1]!;

    expect(resolvesUniquelyTo(buildElementSelector(element), element)).toBe(true);
  });

  it("counts siblings by type, so a mixed parent still resolves", () => {
    mount("<div><p>a</p><span>b</span><p>c</p></div>");

    const element = document.querySelectorAll("p")[1]!;

    expect(resolvesUniquelyTo(buildElementSelector(element), element)).toBe(true);
  });
});

describe("describeAnnotatedElement", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reports the tag, the index it was given and a resolving selector", () => {
    mount('<main><button id="cta">Go</button></main>');

    const element = document.getElementById("cta")!;
    const annotation = describeAnnotatedElement(element, 3);

    expect(annotation.index).toBe(3);
    expect(annotation.tag).toBe("button");
    expect(annotation.selector).toBe("#cta");
    expect(annotation.rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("collapses whitespace and truncates long text", () => {
    mount(`<p id="copy">${"word ".repeat(60)}</p>`);

    const annotation = describeAnnotatedElement(document.getElementById("copy")!, 1);

    expect(annotation.text!.length).toBeLessThanOrEqual(120);
    expect(annotation.text!.endsWith("…")).toBe(true);
    expect(annotation.text!.startsWith("word word")).toBe(true);
  });

  it("keeps short text verbatim and omits it when there is none", () => {
    mount('<p id="copy">  Hello\n  world  </p><img id="pic" alt="" />');

    expect(describeAnnotatedElement(document.getElementById("copy")!, 1).text).toBe(
      "Hello world",
    );
    expect(describeAnnotatedElement(document.getElementById("pic")!, 2)).not.toHaveProperty(
      "text",
    );
  });

  it("reads a source location from data-source", () => {
    mount('<b id="tagged" data-source="src/pages/app.tsx:12:5">x</b>');

    expect(describeAnnotatedElement(document.getElementById("tagged")!, 1).source).toEqual({
      file: "src/pages/app.tsx",
      line: 12,
      column: 5,
    });
  });

  it("reads a source location from the inspector attributes", () => {
    mount(
      '<b id="tagged" data-inspector-relative-path="src/app.tsx" data-inspector-line="7">x</b>',
    );

    expect(describeAnnotatedElement(document.getElementById("tagged")!, 1).source).toEqual({
      file: "src/app.tsx",
      line: 7,
    });
  });

  it("omits the source when no data attribute carries one", () => {
    mount('<b id="plain" data-source="not-a-location">x</b>');

    expect(describeAnnotatedElement(document.getElementById("plain")!, 1)).not.toHaveProperty(
      "source",
    );
  });

  it("never reports a React name, which an isolated world cannot read", () => {
    mount('<b id="plain">x</b>');

    expect(
      Object.keys(describeAnnotatedElement(document.getElementById("plain")!, 1)),
    ).not.toContain("reactName");
  });
});

describe("acceptBrowserAnnotationMessage", () => {
  const trustedSender = { id: "view" };
  const annotation = {
    index: 1,
    selector: "#cta",
    tag: "button",
    rect: { x: 1, y: 2, width: 3, height: 4 },
  };

  it("refuses a sender that is not the embedded view", () => {
    expect(
      acceptBrowserAnnotationMessage({
        sender: { id: "renderer" },
        trustedSender,
        message: { type: "annotations", annotations: [annotation] },
      }),
    ).toBeNull();
  });

  it("refuses every sender while no view exists", () => {
    expect(
      acceptBrowserAnnotationMessage({
        sender: trustedSender,
        trustedSender: null,
        message: { type: "ready" },
      }),
    ).toBeNull();
  });

  it("refuses messages outside the whitelist", () => {
    for (const message of [
      null,
      "annotations",
      { type: "evaluate", code: "fetch('/')" },
      { type: "design-mode" },
      { type: "design-mode", enabled: "yes" },
      { type: "annotations" },
      { type: "annotations", annotations: {} },
    ]) {
      expect(
        acceptBrowserAnnotationMessage({ sender: trustedSender, trustedSender, message }),
      ).toBeNull();
    }
  });

  it("drops annotations whose required fields are not what they claim", () => {
    const accepted = acceptBrowserAnnotationMessage({
      sender: trustedSender,
      trustedSender,
      message: {
        type: "annotations",
        annotations: [
          annotation,
          { ...annotation, index: 2, selector: 42 },
          { ...annotation, index: 3, rect: { x: 0, y: 0, width: Number.NaN, height: 0 } },
        ],
      },
    });

    expect(accepted).toEqual({ type: "annotations", annotations: [annotation] });
  });

  it("rebuilds each annotation, so page-supplied extras never travel on", () => {
    const accepted = acceptBrowserAnnotationMessage({
      sender: trustedSender,
      trustedSender,
      message: {
        type: "annotations",
        annotations: [
          {
            ...annotation,
            text: "x".repeat(400),
            comment: "y".repeat(2_000),
            source: { file: "src/app.tsx", line: 3, column: 1 },
            html: "<script>alert(1)</script>",
          },
        ],
      },
    });
    const [first] = (accepted as { annotations: Array<Record<string, unknown>> }).annotations;

    expect(first).not.toHaveProperty("html");
    expect((first.text as string).length).toBeLessThanOrEqual(120);
    expect((first.comment as string).length).toBeLessThanOrEqual(500);
    expect(first.source).toEqual({ file: "src/app.tsx", line: 3, column: 1 });
  });

  it("passes the whitelisted lifecycle messages through", () => {
    expect(
      acceptBrowserAnnotationMessage({
        sender: trustedSender,
        trustedSender,
        message: { type: "ready" },
      }),
    ).toEqual({ type: "ready" });
    expect(
      acceptBrowserAnnotationMessage({
        sender: trustedSender,
        trustedSender,
        message: { type: "design-mode", enabled: false },
      }),
    ).toEqual({ type: "design-mode", enabled: false });
  });
});
