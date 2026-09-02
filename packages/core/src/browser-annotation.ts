// Embedded browser annotations — what the user marked in design mode, and how
// it reaches Pi. The shapes are shared by the Electron main process, the
// annotation preload and the renderer; the formatter is what the model reads.
// Decision record: .scratch/embedded-browser/PRD.md (decision 5).

/**
 * The embedded page's own viewport when the marks were taken, not the panel's
 * rect: the marks are measured in this coordinate space, and the panel can be
 * resized between marking and sending.
 */
export type BrowserAnnotationViewport = {
  width: number;
  height: number;
  dpr: number;
};

/**
 * One element the user marked in design mode. Produced in the embedded page's
 * isolated world, validated in main, read by the renderer.
 *
 * There is no `reactName`: the isolated world shares the page's DOM but not
 * its JS wrappers, so React's `__reactFiber$` expando is simply not there
 * (PRD S2 implementation constraint 1). `source` is the best-effort stand-in,
 * read from whatever `data-*` attributes the dev server stamped.
 */
export type BrowserAnnotationElement = {
  /** 1-based; the number the marker shows in the page and on the screenshot. */
  index: number;
  selector: string;
  tag: string;
  text?: string;
  /** Viewport-relative, as measured when the element was marked. */
  rect: { x: number; y: number; width: number; height: number };
  source?: { file: string; line: number; column?: number };
  comment?: string;
};

export type BrowserAnnotationPayload = {
  url: string;
  title?: string;
  viewport: BrowserAnnotationViewport;
  elements: BrowserAnnotationElement[];
  capturedAt: string;
};

const heading =
  "Browser annotations from the embedded preview — the attached screenshot shows the same numbered markers.";

function formatSource(source: NonNullable<BrowserAnnotationElement["source"]>) {
  return source.column
    ? `${source.file}:${source.line}:${source.column}`
    : `${source.file}:${source.line}`;
}

/**
 * The markdown block the `Send to composer` action drops into the draft.
 *
 * Fixed on purpose: this is the contract Pi reads, so the shape of it is
 * pinned by tests rather than tuned per call site. Rects are left out — the
 * numbered markers on the screenshot are what locate an element, and a rect
 * recorded before a scroll would point somewhere else. Text and comments
 * arrive already clamped (main rebuilds every annotation field by field), so
 * nothing is truncated a third time here.
 */
export function formatBrowserAnnotationPrompt(payload: BrowserAnnotationPayload) {
  const lines = [heading, "", `- URL: ${payload.url}`];

  if (payload.title) {
    lines.push(`- Title: ${payload.title}`);
  }

  lines.push(
    `- Viewport: ${payload.viewport.width}×${payload.viewport.height} @${payload.viewport.dpr}x`,
    `- Captured: ${payload.capturedAt}`,
  );

  for (const element of payload.elements) {
    // A mark with nothing said about it is still a mark: the user pointed at
    // it, and dropping the row would silently lose that.
    lines.push(
      "",
      `#${element.index} \`${element.selector}\` (${element.tag}) — ${
        element.comment ?? "(no comment)"
      }`,
    );

    if (element.text) {
      lines.push(`  - text: "${element.text}"`);
    }

    if (element.source) {
      lines.push(`  - source: \`${formatSource(element.source)}\``);
    }
  }

  return lines.join("\n");
}
