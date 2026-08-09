import { useParams } from "@tanstack/react-router";
import { Card } from "@astryxdesign/core/Card";
import { AppFrame } from "@/app/app-shell";
import { NoProvidersEmptyState } from "@/entities/session/no-providers-empty-state";
import { useProviderAuthStatus } from "@/entities/session/use-provider-auth-status";
import { SessionDetailPage } from "@/pages/session-detail";
import { SessionListPanel } from "@/pages/session-list";

/**
 * Messaging-archetype frame: the session list is a fixed-width sidebar
 * finder, the replay is the fluid reading pane. Fixed budget instead of a
 * resizable split — the finder's width is set by its content density, and
 * extra viewport space belongs to the reading pane.
 */
function TraceEmptyState() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6">
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

export function TraceWorkspace({
  selectedSessionId,
  children,
}: {
  selectedSessionId?: string;
  children: React.ReactNode;
}) {
  return (
    <AppFrame>
      <article
        className="h-full min-h-0 overflow-hidden"
        data-testid="trace-workspace"
      >
        <div className="flex h-full min-h-0 w-full" data-testid="trace-split-view">
          <div
            className="h-full w-80 min-h-0 shrink-0 border-r border-separator"
            data-testid="trace-list-pane"
          >
            <SessionListPanel selectedSessionId={selectedSessionId} />
          </div>
          <div
            className="min-h-0 min-w-0 flex-1 overflow-hidden"
            data-testid="trace-detail-pane"
          >
            {children}
          </div>
        </div>
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
