import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/**
 * xterm.js host — the terminal primitive Astryx does not have. Owns the whole
 * xterm lifecycle (open / fit / dispose) and talks to its parent through the
 * imperative handle plus two callbacks; it knows nothing about the backend,
 * so the panel can re-point it at any terminal instance.
 */
export type TerminalViewHandle = {
  write(data: string): void;
  focus(): void;
};

export type TerminalViewProps = {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  className?: string;
};

/**
 * Resolves any CSS color (token reference, color-mix(), …) to a concrete
 * rgb()/rgba() string.
 *
 * A probe element is the only reliable way: the bridge chains var() references
 * and theme-neutral declares its first-level tokens inside an @scope block off
 * :root, so getPropertyValue("--background") on documentElement comes back
 * empty or unsubstituted. Reading a real property (backgroundColor/color) off
 * a probe mounted inside the theme scope resolves the whole chain — @scope,
 * chained var(), light-dark(), color-mix() — to a value xterm can parse.
 */
function resolveCssColor(
  scope: HTMLElement,
  property: "backgroundColor" | "color",
  cssValue: string,
) {
  const probe = document.createElement("span");

  probe.style.display = "none";
  probe.style[property] = cssValue;
  scope.appendChild(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();

  return value || undefined;
}

/** Resolved value of a semantic bridge token (app/styles.css), or undefined. */
function resolveTokenColor(
  scope: HTMLElement,
  property: "backgroundColor" | "color",
  token: string,
) {
  return resolveCssColor(scope, property, `var(${token})`);
}

/** Resolved font family for the terminal, token-backed when available. */
function resolveTerminalFontFamily(scope: HTMLElement) {
  const probe = document.createElement("span");

  probe.style.display = "none";
  // var() fallback covers the token being absent entirely.
  probe.style.fontFamily = "var(--font-family-code, monospace)";
  scope.appendChild(probe);
  const value = getComputedStyle(probe).fontFamily;
  probe.remove();

  return value || "monospace";
}

/** Luminance of an rgb()/rgba() string, 0 (black) to 255 (white). */
function colorLuminance(resolved: string) {
  const match = resolved.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);

  if (!match) {
    return 0;
  }

  const [, r, g, b] = match;

  return 0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b);
}

/** Canvas 2d availability — false in jsdom, true in the real renderer. */
function has2dCanvas() {
  try {
    return Boolean(document.createElement("canvas").getContext("2d"));
  } catch {
    return false;
  }
}

/**
 * Conventional terminal palettes (VS Code dark / light). These carry
 * program-output semantics (red diff deletions, green test passes), not UI
 * chrome, so they stay recognizable; the set is chosen by the resolved
 * background's luminance so both OS schemes stay legible.
 */
const ansiDark: Pick<
  ITheme,
  | "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white"
  | "brightBlack" | "brightRed" | "brightGreen" | "brightYellow"
  | "brightBlue" | "brightMagenta" | "brightCyan" | "brightWhite"
> = {
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#ffffff",
};

const ansiLight: typeof ansiDark = {
  black: "#000000",
  red: "#cd3131",
  green: "#00bc00",
  yellow: "#949800",
  blue: "#0451a5",
  magenta: "#bc05bc",
  cyan: "#0598bc",
  white: "#555555",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#14ce14",
  brightYellow: "#b5ba00",
  brightBlue: "#0451a5",
  brightMagenta: "#bc05bc",
  brightCyan: "#0598bc",
  brightWhite: "#a5a5a5",
};

/**
 * Chrome colors come from the app's semantic tokens so the terminal sits in
 * the panel like any other surface (background = --surface, the inspector's
 * own fill). The custom scrollbar slider follows the app's translucent-thumb
 * scrollbar language (styles.css) at the same 18/28% intensities. Recomputed
 * on OS scheme flips via the caller's matchMedia listener; theme-neutral's
 * light-dark() tokens do the rest.
 */
function terminalTheme(scope: HTMLElement): ITheme {
  const background = resolveTokenColor(scope, "backgroundColor", "--surface");
  const foreground = resolveTokenColor(scope, "color", "--foreground");
  const slider = (alpha: number) =>
    resolveCssColor(
      scope,
      "backgroundColor",
      `color-mix(in srgb, var(--foreground) ${alpha}%, transparent)`,
    );

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: resolveTokenColor(scope, "backgroundColor", "--surface-hover"),
    scrollbarSliderBackground: slider(18),
    scrollbarSliderHoverBackground: slider(28),
    scrollbarSliderActiveBackground: slider(40),
    ...(colorLuminance(background ?? "") < 128 ? ansiDark : ansiLight),
  };
}

export const TerminalView = forwardRef<TerminalViewHandle, TerminalViewProps>(
  function TerminalView({ onData, onResize, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    // Callbacks go through refs so a fresh parent closure never rebuilds the
    // xterm instance (which would wipe the visible buffer).
    const onDataRef = useRef(onData);
    const onResizeRef = useRef(onResize);

    useEffect(() => {
      onDataRef.current = onData;
      onResizeRef.current = onResize;
    });

    useImperativeHandle(
      ref,
      () => ({
        write(data) {
          terminalRef.current?.write(data);
        },
        focus() {
          terminalRef.current?.focus();
        },
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: resolveTerminalFontFamily(container),
        fontSize: 12,
        theme: terminalTheme(container),
        // xterm 6's custom scrollbar takes its width from overviewRuler.width
        // (default 14px); slim it to the app's 8px scrollbar language. The
        // same option pulls in the canvas-backed overview ruler, which hard-
        // crashes without a 2d context (jsdom) — so gate on canvas support.
        ...(has2dCanvas() ? { overviewRuler: { width: 8 } } : {}),
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(container);
      terminalRef.current = terminal;

      const dataDisposable = terminal.onData((data) => onDataRef.current?.(data));

      const fit = () => {
        fitAddon.fit();
        onResizeRef.current?.(terminal.cols, terminal.rows);
      };
      fit();

      const observer = new ResizeObserver(() => fit());
      observer.observe(container);

      // theme-neutral follows the OS scheme (light-dark() + :root
      // color-scheme); re-resolve the theme when it flips under us.
      const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const retheme = () => {
        terminal.options.theme = terminalTheme(container);
      };

      schemeQuery.addEventListener?.("change", retheme);

      return () => {
        schemeQuery.removeEventListener?.("change", retheme);
        observer.disconnect();
        dataDisposable.dispose();
        terminal.dispose();
        terminalRef.current = null;
      };
    }, []);

    return <div className={className} data-testid="terminal-view" ref={containerRef} />;
  },
);
