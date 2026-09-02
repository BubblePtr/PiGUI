import type {
  BrowserViewRect,
  BrowserViewSnapshot,
  BrowserViewState,
} from "@/shared/browser-protocol";

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

/**
 * Enumerated rather than prefix-sniffed: main routes on this set, so a future
 * backend command that happens to start with `browser_` still reaches the
 * backend instead of being swallowed here.
 */
const browserCommands = new Set([
  "browser_capture",
  "browser_navigate",
  "browser_back",
  "browser_forward",
  "browser_reload",
  "browser_set_bounds",
  "browser_set_visible",
  "browser_set_design_mode",
  "browser_clear_annotations",
  "browser_open_external",
]);
const allowedProtocols = new Set(["http:", "https:"]);
/**
 * A bare `localhost:5173` looks like a scheme; a real scheme is never followed
 * by a digit, so the lookahead tells the two apart.
 */
const schemePattern = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

export function isBrowserCommand(command: string) {
  return browserCommands.has(command);
}

/**
 * Chromium's ERR_ABORTED. `webContents.loadURL()` rejects with it whenever a
 * page supersedes its own pending navigation (baidu.com does this on load), so
 * it means "superseded", never "broken". `did-fail-load` already ignores the
 * same code.
 */
export function isAbortedLoadError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { errno, code } = error as { errno?: unknown; code?: unknown };

  return errno === -3 || code === "ERR_ABORTED";
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
 * the app, while the host is rebuilt whenever the window is (on macOS a window
 * can close and reopen without quitting). Permission handlers replace each
 * other harmlessly, but blocking downloads is a listener registration, so
 * configuring per host would stack another copy every time.
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
  /** Design mode lives in the page's isolated world; this is the command. */
  setDesignMode(enabled: boolean): void;
  clearAnnotations(): void;
  reload(): void;
  destroy(): void;
  readState(): BrowserViewSnapshot;
  /** PNG data URL of the view as it stands, or null if it cannot be read. */
  capture(): Promise<string | null>;
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
  ): Promise<BrowserViewState | string | null>;
  allowsNavigationTo(url: string): boolean;
  /** `setWindowOpenHandler`: no new windows; an allowed target loads in place. */
  handleWindowOpen(url: string): void;
  /** v1 grants no page permissions at all. */
  allowsPermission(permission: string): boolean;
  /** The id main stamps on every event it forwards to the renderer. */
  currentNavigationId(): number;
  /**
   * Whether the page should be in design mode. Each document gets its own
   * overlay, so main re-applies this whenever a fresh one reports for duty.
   */
  isDesignModeEnabled(): boolean;
  /** Design mode the page left by itself (Escape), so main stops re-applying it. */
  recordDesignMode(enabled: boolean): void;
  /**
   * `did-fail-load` on the main frame. Chromium commits its error page under
   * the URL that failed, so without this the next navigate to that same URL
   * would be short-circuited as "already showing" and Retry would do nothing.
   */
  recordLoadFailure(): void;
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
  let navigationId = 0;
  let loadFailed = false;
  let designMode = false;

  /** The view's own answer, stamped with the navigation the renderer asked for. */
  function readState(): BrowserViewState | null {
    return view ? { ...view.readState(), navigationId } : null;
  }

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

  async function navigate(url: string) {
    const target = normalizeBrowserUrl(url);

    navigationId += 1;

    // Re-entering the surface must not reload the page and lose its state —
    // unless the URL is only showing because its load failed, in which case
    // the view is on Chromium's error page and Retry has to really reload.
    if (view && !loadFailed && view.readState().url === target) {
      return readState();
    }

    const active = ensureView();

    try {
      await active.loadUrl(target);
    } catch (error) {
      // An aborted load is not a failure: the page navigated again before its
      // first request finished, so the request went away while the page it
      // replaced it with is loading fine. Main normalises this too; the guard
      // is repeated here so no caller of the host can be told otherwise.
      if (!isAbortedLoadError(error)) {
        loadFailed = true;
        throw error;
      }
    }

    loadFailed = false;

    return readState();
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

    return readState();
  }

  return {
    async invoke(command, args) {
      switch (command) {
        case "browser_navigate":
          return navigate(readUrlArgument(args));
        case "browser_back":
          view?.goBack();
          return readState();
        case "browser_forward":
          view?.goForward();
          return readState();
        case "browser_reload":
          view?.reload();
          return readState();
        case "browser_set_bounds":
          return setBounds(readRectArgument(args));
        case "browser_set_visible":
          visibilityRequested = args?.visible === true;
          applyVisibility();
          return readState();
        case "browser_set_design_mode":
          // Deliberately not `ensureView()`: turning Design on over the empty
          // state has nothing to mark up, and creating a view would paint one.
          designMode = args?.enabled === true;
          view?.setDesignMode(designMode);
          return null;
        case "browser_clear_annotations":
          view?.clearAnnotations();
          return null;
        case "browser_capture":
          return view ? view.capture() : null;
        case "browser_open_external":
          await deps.openExternal(normalizeBrowserUrl(readUrlArgument(args)));
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

    currentNavigationId() {
      return navigationId;
    },

    isDesignModeEnabled() {
      return designMode;
    },

    recordDesignMode(enabled) {
      designMode = enabled;
    },

    recordLoadFailure() {
      loadFailed = true;
    },

    dispose() {
      view?.destroy();
      view = null;
      bounds = null;
      visibilityRequested = false;
      designMode = false;
    },
  };
}
