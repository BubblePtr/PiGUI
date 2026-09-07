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
function TrajectoryEmptyState() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6">
      <Card className="w-full max-w-xl">
        <div className="text-sm font-semibold uppercase text-muted">Trajectory</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-normal text-foreground">
          Select a Pi session trajectory
        </h2>
        <p className="mt-4 text-sm leading-6 text-muted">
          Choose a historical session from the left list to replay its timeline, cost, tokens,
          thinking, and tool I/O.
        </p>
      </Card>
    </div>
  );
}

export function TrajectoryWorkspace({
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
        data-testid="trajectory-workspace"
      >
        <div className="flex h-full min-h-0 w-full" data-testid="trajectory-split-view">
          <div
            className="h-full w-80 min-h-0 shrink-0 border-r border-separator"
            data-testid="trajectory-list-pane"
          >
            <SessionListPanel selectedSessionId={selectedSessionId} />
          </div>
          <div
            className="min-h-0 min-w-0 flex-1 overflow-hidden"
            data-testid="trajectory-detail-pane"
          >
            {children}
          </div>
        </div>
      </article>
    </AppFrame>
  );
}

export function TrajectoryIndexPage() {
  const { loading, configured } = useProviderAuthStatus();

  return (
    <TrajectoryWorkspace>
      {!loading && !configured ? (
        <NoProvidersEmptyState testId="trajectory-no-providers-empty-state" />
      ) : (
        <TrajectoryEmptyState />
      )}
    </TrajectoryWorkspace>
  );
}

export function TrajectorySessionPage() {
  const { sessionId } = useParams({ from: "/sessions/$sessionId" });

  return (
    <TrajectoryWorkspace selectedSessionId={sessionId}>
      <SessionDetailPage />
    </TrajectoryWorkspace>
  );
}
