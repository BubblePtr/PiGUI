/**
 * Dev-only UI intent picker. Arm it with the floating crosshair button or
 * Cmd/Ctrl+Shift+X, click any element, and copy a paste-ready block that
 * names the CONTEXT.md region term, the component stack with file:line, and
 * the nearest data-testid — so a UI change request to an agent points at
 * exactly the right code. Mounted from main.tsx behind import.meta.env.DEV;
 * never shipped in production builds.
 *
 * While armed, a full-viewport "glass" pane captures every pointer event:
 * app hover side effects (tooltips, flyouts, hover reveals) never fire, and
 * the pick click can't reach app handlers. The real target is resolved with
 * document.elementFromPoint while the glass is momentarily pointer-events:
 * none — the same trick browser DevTools inspect mode uses.
 */

import { useRef, useEffect, useState } from "react";
import * as astryxCore from "@astryxdesign/core";
import { Cancel, Check, Copy, Crosshair } from "@/shared/ui/icons";
import {
  componentStackFromFiber,
  definitionSite,
  fiberFromElement,
  innermostComponent,
  nearestTestId,
  type ComponentStackEntry,
} from "./fiber-stack";
import { formatIntentBlock, type IntentTarget } from "./format-intent";
import { matchRegion } from "./regions";

type PickerMode = "idle" | "armed" | "selected";

type HoverTarget = {
  rect: { left: number; top: number; width: number; height: number };
  label: string;
};

const OVERLAY_ATTRIBUTE = "data-ui-intent-picker";
const MAX_STACK_ROWS = 8;

// DevTools-inspector blue, deliberately theme-independent: the overlay must
// stand out against every app surface, so it does not consume design tokens.
const HIGHLIGHT_COLOR = "#3b82f6";
const HIGHLIGHT_FILL = "rgba(59, 130, 246, 0.12)";

/**
 * Components that are never the user's intent target: Astryx design-system
 * exports (Button, Popover, … — usage sites live in app files, so they
 * masquerade as app code) plus the local icon wrappers. They render muted in
 * the stack and are skipped when choosing the headline component.
 */
const genericComponentNames = new Set([
  ...Object.keys(astryxCore),
  "HugeiconsIcon",
  "PiGUIIcon",
]);

/** True when the event target is part of the picker's own chrome. */
function isOverlayElement(target: EventTarget | Element | null): boolean {
  return (
    target instanceof Element && target.closest(`[${OVERLAY_ATTRIBUTE}]`) !== null
  );
}

function headlineComponent(stack: ComponentStackEntry[]): ComponentStackEntry | null {
  // The innermost app component is what the user means; library components
  // (Astryx internals) are noise unless nothing else matched.
  return (
    stack.find((entry) => entry.kind === "component" && !entry.library) ??
    innermostComponent(stack)
  );
}

export function buildIntentTarget(element: Element): IntentTarget {
  const fiber = fiberFromElement(element);
  const stack = fiber ? componentStackFromFiber(fiber) : [];

  // Flag design-system primitives by name — their JSX usage sites point into
  // app files, so the path-based `library` flag alone cannot spot them.
  for (const entry of stack) {
    if (genericComponentNames.has(entry.name)) {
      entry.library = true;
    }
  }

  const headline = headlineComponent(stack);

  return {
    region: matchRegion(stack, element),
    stack,
    component: headline
      ? {
          name: headline.name,
          definition: headline.fiber
            ? definitionSite(headline.fiber)
            : { file: null, line: null },
          usage: { file: headline.file, line: headline.line },
        }
      : null,
    testId: nearestTestId(element),
  };
}

function hoverLabel(element: Element): string {
  const fiber = fiberFromElement(element);
  const stack = fiber ? componentStackFromFiber(fiber) : [];

  for (const entry of stack) {
    if (genericComponentNames.has(entry.name)) {
      entry.library = true;
    }
  }

  const region = matchRegion(stack, element);

  if (region) {
    return region.region.term;
  }

  return headlineComponent(stack)?.name ?? element.tagName.toLowerCase();
}

function locationOf(entry: ComponentStackEntry): string | null {
  if (!entry.file) {
    return null;
  }

  return entry.line ? `${entry.file}:${entry.line}` : entry.file;
}

export function UiIntentPicker() {
  const [mode, setMode] = useState<PickerMode>("idle");
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [target, setTarget] = useState<IntentTarget | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const glassRef = useRef<HTMLDivElement | null>(null);

  // Global hotkeys: Cmd/Ctrl+Shift+X toggles pick mode, Esc backs out.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "KeyX") {
        event.preventDefault();
        setHover(null);
        setMode((current) => (current === "armed" ? "idle" : "armed"));
        return;
      }

      if (event.key === "Escape") {
        setHover(null);
        setTarget(null);
        setMode("idle");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * The element visually under the cursor: momentarily drop the glass's
   * pointer events so hit testing sees through it (and through the
   * pointer-events-none highlight layers) to the real app element.
   */
  const pickElementAt = (clientX: number, clientY: number): Element | null => {
    const glass = glassRef.current;
    if (!glass || typeof document.elementFromPoint !== "function") {
      return null;
    }

    glass.style.pointerEvents = "none";
    try {
      const found = document.elementFromPoint(clientX, clientY);
      return found && !isOverlayElement(found) ? found : null;
    } finally {
      glass.style.pointerEvents = "";
    }
  };

  const onGlassPointerMove = (event: React.PointerEvent) => {
    const element = pickElementAt(event.clientX, event.clientY);
    if (!element) {
      setHover(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    setHover({
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      label: hoverLabel(element),
    });
  };

  const onGlassClick = (event: React.MouseEvent) => {
    const element = pickElementAt(event.clientX, event.clientY);
    if (!element) {
      return;
    }

    setHover(null);
    setTarget(buildIntentTarget(element));
    setMode("selected");
  };

  const copyBlock = async () => {
    if (!target) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatIntentBlock(target));
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  const pickAgain = () => {
    setTarget(null);
    setCopied(false);
    setCopyFailed(false);
    setMode("armed");
  };

  const close = () => {
    setTarget(null);
    setHover(null);
    setMode("idle");
  };

  const components = target?.stack.filter((entry) => entry.kind === "component") ?? [];
  const componentDefinition = target?.component
    ? target.component.definition.file
      ? `${target.component.definition.file}${target.component.definition.line ? `:${target.component.definition.line}` : ""}`
      : null
    : null;

  return (
    <>
      {mode === "idle" ? (
        <button
          aria-label="Pick a UI element to copy its intent block"
          className="fixed bottom-4 right-4 z-[9999] flex size-8 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-md transition-colors hover:bg-surface-hover hover:text-foreground"
          data-ui-intent-picker
          title="Pick UI intent (Cmd/Ctrl+Shift+X)"
          type="button"
          onClick={() => setMode("armed")}
        >
          <Crosshair aria-hidden="true" className="size-4" />
        </button>
      ) : null}

      {mode === "armed" ? (
        <div
          ref={glassRef}
          className="fixed inset-0 z-[9997] cursor-crosshair"
          data-testid="ui-intent-picker-glass"
          data-ui-intent-picker
          onClick={onGlassClick}
          onPointerMove={onGlassPointerMove}
        />
      ) : null}

      {mode === "armed" && hover ? (
        <div className="pointer-events-none fixed inset-0 z-[9998]" data-ui-intent-picker>
          <div
            className="fixed rounded-sm"
            style={{
              ...hover.rect,
              background: HIGHLIGHT_FILL,
              border: `2px solid ${HIGHLIGHT_COLOR}`,
            }}
          />
          <div
            className="fixed max-w-72 truncate rounded-sm border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-foreground shadow-md"
            style={{
              borderColor: HIGHLIGHT_COLOR,
              left: hover.rect.left,
              top: Math.max(4, hover.rect.top - 24),
            }}
          >
            {hover.label}
          </div>
        </div>
      ) : null}

      {mode === "armed" ? (
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-[9999] rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted shadow-lg"
          data-ui-intent-picker
        >
          Click any element to capture it · Esc to cancel
        </div>
      ) : null}

      {mode === "selected" && target ? (
        <div
          className="fixed bottom-4 right-4 z-[9999] flex max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] flex-col rounded-md border border-border bg-surface shadow-xl"
          data-testid="ui-intent-picker-panel"
          data-ui-intent-picker
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-foreground">UI intent</span>
            <button
              aria-label="Close UI intent picker"
              className="flex size-5 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              type="button"
              onClick={close}
            >
              <Cancel aria-hidden="true" className="size-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 py-2 text-xs">
            {target.region ? (
              <div className="flex items-baseline gap-1.5">
                <span className="shrink-0 text-muted">Region</span>
                <span className="font-mono font-semibold text-primary">
                  {target.region.region.term}
                </span>
                <span className="text-muted">· CONTEXT.md</span>
              </div>
            ) : (
              <div className="text-muted">
                No CONTEXT.md region matched — consider adding a binding to
                dev/ui-intent/regions.ts
              </div>
            )}

            {target.component ? (
              <div className="mt-2 font-mono text-foreground">
                {target.component.name}
                {componentDefinition ? (
                  <span className="text-muted"> — {componentDefinition}</span>
                ) : null}
              </div>
            ) : null}

            {components.length > 0 ? (
              <ol className="mt-2 space-y-0.5">
                {components.slice(0, MAX_STACK_ROWS).map((entry, index) => (
                  <li
                    key={`${entry.name}-${index}`}
                    className="flex items-baseline gap-1.5 font-mono text-[11px]"
                  >
                    <span className={entry.library ? "text-muted" : "text-foreground"}>
                      {entry.name}
                    </span>
                    {locationOf(entry) ? (
                      <span className="truncate text-muted">{locationOf(entry)}</span>
                    ) : null}
                  </li>
                ))}
                {components.length > MAX_STACK_ROWS ? (
                  <li className="font-mono text-[11px] text-muted">
                    … ({components.length - MAX_STACK_ROWS} more)
                  </li>
                ) : null}
              </ol>
            ) : null}

            {target.testId ? (
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="shrink-0 text-muted">testid</span>
                <span className="font-mono text-foreground">{target.testId}</span>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2 py-1 text-xs text-foreground transition-colors hover:bg-surface-hover"
              type="button"
              onClick={() => void copyBlock()}
            >
              {copied ? (
                <Check aria-hidden="true" className="size-3.5" />
              ) : (
                <Copy aria-hidden="true" className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy intent block"}
            </button>
            <button
              className="inline-flex items-center rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              type="button"
              onClick={pickAgain}
            >
              Pick again
            </button>
            {copyFailed ? (
              <span className="text-xs text-danger">Clipboard unavailable</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
