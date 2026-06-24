import { useParams } from "@tanstack/react-router";
import { Card } from "@heroui/react";
import { AppFrame } from "./app-shell";
import { SessionDetailPage } from "./session-detail";
import { SessionListPanel } from "./session-list";

function TraceEmptyState() {
  return (
    <div className="flex min-h-[28rem] items-center justify-center">
      <Card className="w-full max-w-xl">
        <Card.Header className="block">
          <div className="text-sm font-semibold uppercase text-muted">Trace</div>
          <Card.Title className="mt-3 text-2xl font-semibold tracking-normal text-foreground">
            Select a Pi session
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p className="text-sm leading-6 text-muted">
            Choose a session from the left list to replay its timeline, cost, tokens, thinking, and
            tool I/O.
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}

function TraceWorkspace({ selectedSessionId, children }: { selectedSessionId?: string; children: React.ReactNode }) {
  return (
    <AppFrame>
      <article className="min-h-full px-6 py-6">
        <div className="mx-auto grid w-full max-w-7xl gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <SessionListPanel selectedSessionId={selectedSessionId} />
          <div className="min-w-0">{children}</div>
        </div>
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
