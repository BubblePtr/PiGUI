import { useParams } from "@tanstack/react-router";
import { Card } from "@heroui/react";
import { Resizable } from "@heroui-pro/react/resizable";
import { useEffect, useState } from "react";
import { AppFrame } from "@/app/app-shell";
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
        <Card.Header className="block">
          <div className="text-sm font-semibold uppercase text-muted">Trace</div>
          <Card.Title className="mt-3 text-2xl font-semibold tracking-normal text-foreground">
            Select a Pi session trace
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p className="text-sm leading-6 text-muted">
            Choose a historical session from the left list to replay its timeline, cost, tokens,
            thinking, and tool I/O.
          </p>
        </Card.Content>
      </Card>
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
  const resizableSizes = getTraceResizableSizes(isLargeLayout);

  return (
    <AppFrame>
      <article
        className="h-full min-h-0 overflow-hidden px-6 py-6"
        data-testid="trace-workspace"
      >
        <Resizable
          className="mx-auto h-full min-h-0 w-full max-w-7xl"
          data-testid="trace-split-view"
          orientation={isLargeLayout ? "horizontal" : "vertical"}
        >
          <Resizable.Panel
            defaultSize={resizableSizes.listDefaultSize}
            maxSize={resizableSizes.listMaxSize}
            minSize={resizableSizes.listMinSize}
          >
            <div className="h-full min-h-0 min-w-0" data-testid="trace-list-pane">
              <SessionListPanel selectedSessionId={selectedSessionId} />
            </div>
          </Resizable.Panel>
          <Resizable.Handle
            aria-label="Resize trace panes"
            className={isLargeLayout ? "mx-2" : "my-2"}
          />
          <Resizable.Panel
            defaultSize={resizableSizes.detailDefaultSize}
            minSize={resizableSizes.detailMinSize}
          >
            <div
              className="h-full min-h-0 min-w-0 overflow-hidden"
              data-testid="trace-detail-pane"
            >
              {children}
            </div>
          </Resizable.Panel>
        </Resizable>
      </article>
    </AppFrame>
  );
}

export function TraceIndexPage() {
  return (
    <TraceWorkspace>
      <TraceEmptyState />
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
