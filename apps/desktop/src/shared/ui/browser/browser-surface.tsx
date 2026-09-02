import type { Ref } from "react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Globe,
  LinkExternal,
  RefreshCw,
  Trash2,
} from "@/shared/ui/icons";

/**
 * Chrome for the embedded browser surface: an address band plus the region the
 * native `WebContentsView` paints behind.
 *
 * The component owns no view — it renders a placeholder whose rect the panel
 * pushes to the main process. That is why every non-live state deliberately
 * drops the placeholder: no placeholder, no bounds, no native view painting
 * where it must not (the Sheet fallback below the dock breakpoint, and the
 * error state where Chromium's own error page would show instead of ours).
 */
export type BrowserSurfaceState =
  | { kind: "narrow" }
  | { kind: "unsupported" }
  | { kind: "empty" }
  | { kind: "live" }
  | { kind: "error"; message: string };

export function BrowserSurface({
  address,
  state,
  canGoBack,
  canGoForward,
  annotationCount,
  designMode,
  snapshot,
  viewportRef,
  onAddressChange,
  onAddressSubmit,
  onBack,
  onForward,
  onReload,
  onOpenExternal,
  onClearAnnotations,
  onDesignModeChange,
}: {
  address: string;
  state: BrowserSurfaceState;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Elements marked in the page; the marks themselves live in the page. */
  annotationCount: number;
  designMode: boolean;
  /**
   * Still of the page, shown instead of the native view while a DOM overlay
   * is open — the native view would otherwise cover it.
   */
  snapshot?: string | null;
  viewportRef?: Ref<HTMLDivElement>;
  onAddressChange: (address: string) => void;
  onAddressSubmit: (address: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpenExternal: () => void;
  onClearAnnotations: () => void;
  onDesignModeChange: (designMode: boolean) => void;
}) {
  const hasChrome = state.kind !== "narrow" && state.kind !== "unsupported";
  const isLive = state.kind === "live";

  return (
    <div className="flex h-full min-h-0 flex-col" data-slot="browser-surface">
      {hasChrome ? (
        // A second 40px band under the inspector header, matching the Terminal
        // surface's tab strip: 28px controls with 6px either side.
        <div className="flex shrink-0 items-center gap-1 py-1.5">
          <IconButton
            icon={<ArrowLeft className="size-4" />}
            isDisabled={!canGoBack}
            label="Back"
            size="sm"
            variant="ghost"
            onClick={onBack}
          />
          <IconButton
            icon={<ArrowRight className="size-4" />}
            isDisabled={!canGoForward}
            label="Forward"
            size="sm"
            variant="ghost"
            onClick={onForward}
          />
          <IconButton
            icon={<RefreshCw className="size-4" />}
            label="Reload"
            size="sm"
            variant="ghost"
            onClick={onReload}
          />
          <TextInput
            isLabelHidden
            label="Address"
            placeholder="localhost:5173"
            size="sm"
            value={address}
            width="100%"
            onChange={onAddressChange}
            onEnter={() => onAddressSubmit(address)}
          />
          {/* Plain buttons only. Anything that opens a layer — Popover,
              Tooltip, Select — would trip the overlay detection and freeze the
              page into a still, leaving the user marking up a screenshot. */}
          <ToggleButton
            icon={<Crosshair className="size-4" />}
            isDisabled={!isLive}
            // Nothing can be marked where no page is live, so the toggle never
            // reads as pressed there — a pressed, disabled control claims a
            // state the user cannot leave.
            isPressed={isLive && designMode}
            label="Design"
            size="sm"
            onPressedChange={onDesignModeChange}
          />
          {isLive && annotationCount > 0 ? (
            <span
              className="shrink-0 text-xs tabular-nums text-muted"
              data-testid="browser-annotation-count"
            >
              {annotationCount} marked
            </span>
          ) : null}
          <IconButton
            icon={<Trash2 className="size-4" />}
            isDisabled={!isLive || annotationCount === 0}
            label="Clear marks"
            size="sm"
            variant="ghost"
            onClick={onClearAnnotations}
          />
          <IconButton
            icon={<LinkExternal className="size-4" />}
            isDisabled={!isLive}
            label="Open in default browser"
            size="sm"
            variant="ghost"
            onClick={onOpenExternal}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <BrowserSurfaceBody
          snapshot={snapshot}
          state={state}
          viewportRef={viewportRef}
          onReload={onReload}
        />
      </div>
    </div>
  );
}

function BrowserSurfaceBody({
  state,
  snapshot,
  viewportRef,
  onReload,
}: {
  state: BrowserSurfaceState;
  snapshot?: string | null;
  viewportRef?: Ref<HTMLDivElement>;
  onReload: () => void;
}) {
  switch (state.kind) {
    case "narrow":
      return (
        <EmptyState
          className="h-full justify-center px-4"
          description="A native browser view cannot sit inside the Sheet fallback, so the browser needs the docked inspector."
          icon={<Globe className="size-5 text-muted" />}
          isCompact
          title="Widen the window to use the browser"
        />
      );
    case "unsupported":
      return (
        <EmptyState
          className="h-full justify-center px-4"
          icon={<Globe className="size-5 text-muted" />}
          isCompact
          title="Browser requires the desktop app."
        />
      );
    case "empty":
      return (
        <EmptyState
          className="h-full justify-center px-4"
          description="Enter the address of a running dev server to preview it here."
          icon={<Globe className="size-5 text-muted" />}
          isCompact
          title="No page loaded"
        />
      );
    case "error":
      return (
        <EmptyState
          actions={<Button label="Retry" size="sm" onClick={onReload} />}
          className="h-full justify-center px-4"
          description={state.message}
          icon={<Globe className="size-5 text-muted" />}
          isCompact
          title="The page did not load"
        />
      );
    case "live":
      // Empty unless a DOM overlay is up: the native view paints over this
      // rect, and its bounds are this element's own `getBoundingClientRect()`.
      // While an overlay needs to be visible the native view steps aside and
      // this still of the page stands in for it, filling the same rect so
      // nothing shifts.
      return (
        <div
          className="h-full w-full"
          data-testid="browser-viewport"
          ref={viewportRef}
        >
          {snapshot ? (
            <img
              alt=""
              className="h-full w-full"
              data-testid="browser-snapshot"
              src={snapshot}
              style={{ objectFit: "fill" }}
            />
          ) : null}
        </div>
      );
  }
}
