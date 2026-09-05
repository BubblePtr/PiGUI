/**
 * Fiber inspection for the dev-only UI intent picker.
 *
 * React 19.2 removed the old `_debugSource` ({fileName, lineNumber}) fiber
 * field; in dev, every fiber now carries `_debugStack` — an Error whose V8
 * stack encodes the line where that JSX was written ("react-stack-top-frame"
 * followed by the user-code frame). Parsing the first non-node_modules frame
 * gives us component names plus precise source locations with zero build
 * changes.
 *
 * Caveat: React only tracks real owner stacks for the first 10,000 elements
 * created per page load (`recentlyCreatedOwnerStacks`). Past that budget —
 * think very long dev sessions — locations degrade to null while component
 * names keep working.
 */

/** Minimal structural view of React's internal Fiber — we only read fields. */
export type FiberLike = {
  type: unknown;
  stateNode?: unknown;
  alternate?: FiberLike | null;
  child: FiberLike | null;
  sibling: FiberLike | null;
  return: FiberLike | null;
  _debugStack?: Error | null;
};

export type ComponentStackEntry = {
  /** Component display name, or the tag name for host elements. */
  name: string;
  kind: "component" | "element";
  /** Repo-relative path of the line where this JSX was written (usage site). */
  file: string | null;
  line: number | null;
  /** True when the source lives under node_modules (Astryx and friends). */
  library: boolean;
  /** Internal: the fiber this entry came from (for definition-site lookup). */
  fiber?: FiberLike;
};

const FIBER_KEY_PREFIXES = ["__reactFiber$", "__reactInternalInstance$", "__reactContainer$"];

export function fiberFromElement(element: Element): FiberLike | null {
  for (const key of Object.keys(element)) {
    if (FIBER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      const fiber = (element as unknown as Record<string, unknown>)[key];
      if (fiber && typeof fiber === "object") {
        return fiber as FiberLike;
      }
    }
  }

  return null;
}

function resolveComponentName(type: unknown): string | null {
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName ?? fn.name ?? null;
  }

  if (type && typeof type === "object") {
    const record = type as {
      displayName?: string;
      render?: { displayName?: string; name?: string };
      type?: unknown;
    };

    if (record.displayName) {
      return record.displayName;
    }

    // forwardRef
    if (record.render && typeof record.render === "function") {
      const render = record.render as { displayName?: string; name?: string };
      return render.displayName ?? render.name ?? null;
    }

    // memo
    if (record.type) {
      return resolveComponentName(record.type);
    }
  }

  return null;
}

/**
 * Turn an absolute source path into a repo-relative one, flagging anything
 * under node_modules as library code.
 */
export function relativeSourcePath(fileName: string): { path: string; library: boolean } {
  const normalized = fileName.replace(/\\/g, "/");

  const nodeModulesIndex = normalized.lastIndexOf("/node_modules/");
  if (nodeModulesIndex >= 0) {
    return { path: normalized.slice(nodeModulesIndex + "/node_modules/".length), library: true };
  }

  for (const marker of ["/apps/", "/packages/", "/e2e/"]) {
    const index = normalized.indexOf(marker);
    if (index >= 0) {
      return { path: normalized.slice(index + 1), library: false };
    }
  }

  return { path: normalized, library: false };
}

/** Matches `path:line:col` inside one V8 stack-frame line. */
const FRAME_LOCATION_RE = /((?:file:\/\/)?(?:https?:\/\/[^\s()/]+)?\/[^\s():]+\.[cm]?[tj]sx?):(\d+):\d+/;

/**
 * Extract the JSX write site from a fiber `_debugStack`: the first stack
 * frame that points at code outside node_modules (React internals — the
 * jsxDEV shim, react_stack_bottom_frame, renderWithHooks… — all live there,
 * so a single library filter skips them).
 *
 * Handles both environments: vitest frames carry absolute fs paths; the
 * electron-vite dev server serves the renderer root (apps/desktop) at the
 * origin, so `/src/...` URL paths map back to `apps/desktop/src/...`.
 */
export function parseDebugStack(
  stack: string | undefined,
): { file: string; line: number; library: boolean } | null {
  if (!stack) {
    return null;
  }

  for (const frameLine of stack.split("\n")) {
    const match = FRAME_LOCATION_RE.exec(frameLine);
    if (!match) {
      continue;
    }

    let path = match[1];
    if (path.includes("/node_modules/")) {
      continue;
    }

    path = path.replace(/^file:\/\//, "").replace(/^https?:\/\/[^\s()/]+/, "");
    if (path.startsWith("/@fs/")) {
      path = path.slice("/@fs".length);
    }

    const { path: relative, library } = relativeSourcePath(path);
    if (library) {
      continue;
    }

    // Dev-server URL path rooted at apps/desktop (vitest paths are absolute
    // fs paths and never reach this branch).
    if (relative.startsWith("/src/")) {
      return { file: `apps/desktop${relative}`, line: Number(match[2]), library: false };
    }

    return { file: relative, line: Number(match[2]), library: false };
  }

  return null;
}

function sourceEntry(fiber: FiberLike) {
  const location = parseDebugStack(fiber._debugStack?.stack);
  return location
    ? { file: location.file, line: location.line, library: location.library }
    : { file: null, line: null, library: false };
}

/**
 * Where the component's own render output is written: the first descendant
 * fiber (depth-limited DFS) with a parseable `_debugStack`. For a composite
 * fiber that file is the component's own file — its JSX sites point there.
 */
export function definitionSite(fiber: FiberLike): { file: string | null; line: number | null } {
  const visit = (node: FiberLike | null, depth: number): { file: string; line: number } | null => {
    if (!node || depth > 4) {
      return null;
    }

    const location = parseDebugStack(node._debugStack?.stack);
    if (location) {
      return { file: location.file, line: location.line };
    }

    return visit(node.child, depth + 1) ?? visit(node.sibling, depth + 1);
  };

  return visit(fiber.child, 0) ?? { file: null, line: null };
}

/**
 * Walk from the clicked element's fiber up to the root, collecting host
 * elements and named composite components. Index 0 is the clicked element
 * itself; every later entry is an ancestor in the React tree (portals
 * included — the fiber chain follows the React tree, not the DOM).
 */
export function componentStackFromFiber(fiber: FiberLike): ComponentStackEntry[] {
  const stack: ComponentStackEntry[] = [];
  let current: FiberLike | null = fiber;

  while (current) {
    const entry = entryFromFiber(current);
    if (entry) stack.push(entry);

    current = current.return;
  }

  return stack;
}

/** Nearest `data-testid` on the element itself or a DOM ancestor. */
export function nearestTestId(element: Element): string | null {
  let current: Element | null = element;

  while (current) {
    const testId = current.getAttribute("data-testid");
    if (testId) {
      return testId;
    }

    current = current.parentElement;
  }

  return null;
}

/** First entry of `kind: "component"` — what the user most likely means. */
export function innermostComponent(stack: ComponentStackEntry[]): ComponentStackEntry | null {
  return stack.find((entry) => entry.kind === "component") ?? null;
}

/** Describe a single fiber without walking its ancestors. */
export function entryFromFiber(fiber: FiberLike): ComponentStackEntry | null {
  const host = typeof fiber.type === "string";
  const name = host ? fiber.type as string : resolveComponentName(fiber.type);
  return name ? { name, kind: host ? "element" : "component", ...sourceEntry(fiber), fiber } : null;
}
