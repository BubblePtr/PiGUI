import type { BrowserViewRect, BrowserViewState } from "@/shared/browser-protocol";

/**
 * Policy and lifecycle for the embedded browser surface, with every Electron
 * type kept behind the `BrowserHostView` seam so the rules that matter —
 * which URLs load, where the native view may paint, when it becomes visible —
 * are testable without an Electron process.
 *
 * The embedded page is treated as hostile: the renderer only reports intent,
 * this module resolves and caps it (the ADR-0022 pattern).
 */

/**
 * The window's own titlebar band (traffic lights, drag region). A native child
 * view painted over it would eat the drag region and the window controls, so
 * bounds never start above it however the renderer measures.
 */
export const browserTitlebarBandPx = 40;

const browserCommandPrefix = "browser_";
const allowedProtocols = new Set(["http:", "https:"]);
/**
 * A bare `localhost:5173` looks like a scheme; a real scheme is never followed
 * by a digit, so the lookahead tells the two apart.
 */
const schemePattern = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

export function isBrowserCommand(command: string) {
  return command.startsWith(browserCommandPrefix);
}

/** `will-navigate` guard for navigation the embedded page starts itself. */
export function isAllowedBrowserUrl(url: string) {
  try {
    return allowedProtocols.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Dev servers are typed as `host:port` and speak http; anything else is a real
 * site that should not get a cleartext first hop.
 */
function inferredScheme(authority: string) {
  const host = authority.split(/[/?#]/)[0] ?? "";
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  const isLoopback =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]";

  return isLoopback || /:\d+$/.test(host) ? "http:" : "https:";
}

/**
 * The single gate for every URL that reaches the view. `will-navigate` only
 * covers navigation the page starts — a main-process `loadURL` bypasses it
 * entirely (S0 spike), so commands must be checked here as well.
 */
export function normalizeBrowserUrl(input: string) {
  const candidate = input.trim();

  if (!candidate) {
    throw new Error("A URL is required.");
  }

  const withScheme = schemePattern.test(candidate)
    ? candidate
    : `${inferredScheme(candidate)}//${candidate}`;
  let parsed: URL;

  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`"${input}" is not a valid URL.`);
  }

  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(
      `The browser surface only opens http and https pages, not "${parsed.protocol}".`,
    );
  }

  return parsed.toString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Caps the renderer's measured rect against the live window so a layout bug
 * can never let the native view cover the titlebar band or spill outside.
 */
export function resolveBrowserViewBounds(input: {
  rect: BrowserViewRect;
  contentSize: { width: number; height: number };
}): BrowserViewRect {
  const { rect, contentSize } = input;
  const x = clamp(Math.round(rect.x), 0, contentSize.width);
  const y = clamp(Math.round(rect.y), browserTitlebarBandPx, contentSize.height);

  return {
    x,
    y,
    width: clamp(Math.round(rect.width), 0, contentSize.width - x),
    height: clamp(Math.round(rect.height), 0, contentSize.height - y),
  };
}

export type BrowserHostSession = {
  setPermissionRequestHandler(handler: (permission: string) => boolean): void;
  setPermissionCheckHandler(handler: (permission: string) => boolean): void;
  blockDownloads(): void;
};

/**
 * Hands out the embedded browser's session, configured exactly once.
 *
 * `session.fromPartition` returns the same persistent object for the life of
 * the app, so configuring it per view would matter: the permission handlers
 * replace each other harmlessly, but blocking downloads is a listener
 * registration, and a view recreated after `browser_dispose` would stack
 * another copy every time.
 */
export function createBrowserSessionProvider<Session extends BrowserHostSession>(
  createSession: () => Session,
  allowsPermission: (permission: string) => boolean,
) {
  let configured: Session | null = null;

  return () => {
    if (configured) {
      return configured;
    }

    const browserSession = createSession();

    browserSession.setPermissionRequestHandler(allowsPermission);
    browserSession.setPermissionCheckHandler(allowsPermission);
    browserSession.blockDownloads();
    configured = browserSession;

    return configured;
  };
}

export type BrowserHostView = {
  setBounds(bounds: BrowserViewRect): void;
  setVisible(visible: boolean): void;
  loadUrl(url: string): Promise<void>;
  goBack(): void;
  goForward(): void;
  reload(): void;
  destroy(): void;
  readState(): BrowserViewState;
};

export type BrowserHostDependencies = {
  createView(): BrowserHostView;
  /** Null while no window is open; bounds are then not applicable. */
  getContentSize(): { width: number; height: number } | null;
  openExternal(url: string): void | Promise<void>;
};

export type BrowserHost = {
  invoke(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<BrowserViewState | null>;
  allowsNavigationTo(url: string): boolean;
  /** `setWindowOpenHandler`: no new windows; an allowed target loads in place. */
  handleWindowOpen(url: string): void;
  /** v1 grants no page permissions at all. */
  allowsPermission(permission: string): boolean;
  dispose(): void;
};

function readUrlArgument(args: Record<string, unknown> | undefined) {
  const url = args?.url;

  if (typeof url !== "string") {
    throw new Error("A URL is required.");
  }

  return url;
}

function readRectArgument(args: Record<string, unknown> | undefined) {
  const rect = args?.rect as Partial<BrowserViewRect> | undefined;

  if (
    typeof rect?.x !== "number" ||
    typeof rect.y !== "number" ||
    typeof rect.width !== "number" ||
    typeof rect.height !== "number"
  ) {
    throw new Error("Browser view bounds require numeric x, y, width and height.");
  }

  return rect as BrowserViewRect;
}

export function createBrowserHost(deps: BrowserHostDependencies): BrowserHost {
  let view: BrowserHostView | null = null;
  let bounds: BrowserViewRect | null = null;
  let visibilityRequested = false;

  /**
   * A view with no bounds yet sits at 0,0 and would cover the whole window,
   * so visibility waits for a usable rect. A collapsed rect (panel closed
   * mid-drag) hides it again rather than leaving a sliver behind.
   */
  function applyVisibility() {
    view?.setVisible(
      visibilityRequested && bounds !== null && bounds.width > 0 && bounds.height > 0,
    );
  }

  function ensureView() {
    if (view) {
      return view;
    }

    view = deps.createView();
    if (bounds) {
      view.setBounds(bounds);
    }
    applyVisibility();

    return view;
  }

  function destroyView() {
    view?.destroy();
    view = null;
  }

  async function navigate(url: string) {
    const target = normalizeBrowserUrl(url);

    // Re-entering the surface must not reload the page and lose its state.
    if (view && view.readState().url === target) {
      return view.readState();
    }

    const active = ensureView();

    await active.loadUrl(target);

    return active.readState();
  }

  function setBounds(rect: BrowserViewRect) {
    const contentSize = deps.getContentSize();

    if (!contentSize) {
      return null;
    }

    bounds = resolveBrowserViewBounds({ rect, contentSize });
    if (!view) {
      return null;
    }

    view.setBounds(bounds);
    applyVisibility();

    return view.readState();
  }

  return {
    async invoke(command, args) {
      switch (command) {
        case "browser_navigate":
          return navigate(readUrlArgument(args));
        case "browser_back":
          view?.goBack();
          return view?.readState() ?? null;
        case "browser_forward":
          view?.goForward();
          return view?.readState() ?? null;
        case "browser_reload":
          view?.reload();
          return view?.readState() ?? null;
        case "browser_set_bounds":
          return setBounds(readRectArgument(args));
        case "browser_set_visible":
          visibilityRequested = args?.visible === true;
          applyVisibility();
          return view?.readState() ?? null;
        case "browser_open_external":
          await deps.openExternal(normalizeBrowserUrl(readUrlArgument(args)));
          return null;
        case "browser_dispose":
          destroyView();
          return null;
        default:
          throw new Error(`Unknown browser command "${command}".`);
      }
    },

    allowsNavigationTo: isAllowedBrowserUrl,

    handleWindowOpen(url) {
      if (!view || !isAllowedBrowserUrl(url)) {
        return;
      }

      void view.loadUrl(url);
    },

    allowsPermission() {
      return false;
    },

    dispose() {
      destroyView();
      bounds = null;
      visibilityRequested = false;
    },
  };
}
