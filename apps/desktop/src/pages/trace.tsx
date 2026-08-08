import { useParams } from "@tanstack/react-router";
import { Card } from "@astryxdesign/core/Card";
import { ResizeHandle, useResizable } from "@astryxdesign/core/Resizable";
import { useEffect, useState } from "react";
import { AppFrame } from "@/app/app-shell";
import { NoProvidersEmptyState } from "@/entities/session/no-providers-empty-state";
import { useProviderAuthStatus } from "@/entities/session/use-provider-auth-status";
import { SessionDetailPage } from "@/pages/session-detail";
import { SessionListPanel } from "@/pages/session-list";

function useLargeTraceLayout() {
  const [isLarge, setIsLarge] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return true;
    }

    return window.matchMedia("(min-width: 1024px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = () => setIsLarge(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isLarge;
}

export function getTraceResizableSizes(isLargeLayout: boolean) {
  return isLargeLayout
    ? {
        detailDefaultSize: 54,
        detailMinSize: 40,
        listDefaultSize: 46,
        listMaxSize: 55,
        listMinSize: 38,
      }
    : {
        detailDefaultSize: 55,
        detailMinSize: 30,
        listDefaultSize: 45,
        listMaxSize: 60,
        listMinSize: 30,
      };
}

function TraceEmptyState() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <Card className="w-full max-w-xl">
        <div className="text-sm font-semibold uppercase text-muted">Trace</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-normal text-foreground">
          Select a Pi session trace
        </h2>
        <p className="mt-4 text-sm leading-6 text-muted">
          Choose a historical session from the left list to replay its timeline, cost, tokens,
          thinking, and tool I/O.
        </p>
      </Card>
    </div>
  );
}

function TraceSplitView({
  isLargeLayout,
  selectedSessionId,
  children,
}: {
  isLargeLayout: boolean;
  selectedSessionId?: string;
  children: React.ReactNode;
}) {
  const resizableSizes = getTraceResizableSizes(isLargeLayout);
  // Percentage bounds resolve against the viewport once; the drag itself is
  // pixel-based (Astryx useResizable), matching the previous percent split.
  const [listSizeBounds] = useState(() => {
    const viewportSize =
      typeof window !== "undefined"
        ? (isLargeLayout ? window.innerWidth : window.innerHeight) || 1024
        : 1024;

    return {
      defaultSizePx: Math.round((viewportSize * resizableSizes.listDefaultSize) / 100),
      minSizePx: Math.round((viewportSize * resizableSizes.listMinSize) / 100),
      maxSizePx: Math.round((viewportSize * resizableSizes.listMaxSize) / 100),
    };
  });
  const listResizable = useResizable({
    defaultSize: listSizeBounds.defaultSizePx,
    minSizePx: listSizeBounds.minSizePx,
    maxSizePx: listSizeBounds.maxSizePx,
  });

  return (
    <div
      className={`mx-auto flex h-full min-h-0 w-full max-w-7xl ${
        isLargeLayout ? "flex-row" : "flex-col"
      }`}
      data-slot="resizable"
      data-testid="trace-split-view"
    >
      <div
        className="min-h-0 min-w-0 shrink-0"
        data-slot="resizable-panel"
        style={
          isLargeLayout
            ? { height: "100%", width: listResizable.size }
            : { height: listResizable.size, width: "100%" }
        }
      >
        <div className="h-full min-h-0 min-w-0" data-testid="trace-list-pane">
          <SessionListPanel selectedSessionId={selectedSessionId} />
        </div>
      </div>
      <ResizeHandle
        className={isLargeLayout ? "mx-2" : "my-2"}
        data-slot="resizable-handle"
        direction={isLargeLayout ? "horizontal" : "vertical"}
        label="Resize trace panes"
        resizable={listResizable.props}
      />
      <div className="min-h-0 min-w-0 flex-1" data-slot="resizable-panel">
        <div
          className="h-full min-h-0 min-w-0 overflow-hidden"
          data-testid="trace-detail-pane"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function TraceWorkspace({
  selectedSessionId,
  children,
}: {
  selectedSessionId?: string;
  children: React.ReactNode;
}) {
  const isLargeLayout = useLargeTraceLayout();

  return (
    <AppFrame>
      <article
        className="h-full min-h-0 overflow-hidden px-6 py-6"
        data-testid="trace-workspace"
      >
        {/* Keyed so a layout flip re-derives the pixel size bounds for the new axis. */}
        <TraceSplitView
          key={isLargeLayout ? "large" : "small"}
          isLargeLayout={isLargeLayout}
          selectedSessionId={selectedSessionId}
        >
          {children}
        </TraceSplitView>
      </article>
    </AppFrame>
  );
}

export function TraceIndexPage() {
  const { loading, configured } = useProviderAuthStatus();

  return (
    <TraceWorkspace>
      {!loading && !configured ? (
        <NoProvidersEmptyState testId="trace-no-providers-empty-state" />
      ) : (
        <TraceEmptyState />
      )}
    </TraceWorkspace>
  );
}

export function TraceSessionPage() {
  const { sessionId } = useParams({ from: "/sessions/$sessionId" });

  return (
    <TraceWorkspace selectedSessionId={sessionId}>
      <SessionDetailPage />
    </TraceWorkspace>
  );
}
