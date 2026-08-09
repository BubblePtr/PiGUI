import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Selector } from "@astryxdesign/core/Selector";
import { Token } from "@astryxdesign/core/Token";
import { useMemo, useState } from "react";
import { Command, Puzzle, RefreshCw } from "@/shared/ui/icons";
import { useRefreshOnWindowFocus } from "@/shared/refresh";
import {
  formatCost,
  formatTimestamp,
  formatTokens,
  listSessions,
  relativeTime,
  type SessionSummary,
  type Title,
} from "@/entities/session/sessions";

// Distinct project names for the filter control, sorted for a stable menu.
export function distinctProjects<T extends { project: string }>(sessions: T[]): string[] {
  return Array.from(new Set(sessions.map((session) => session.project))).sort((a, b) =>
    a.localeCompare(b),
  );
}

// A null project means "all projects" — the list is shown unfiltered.
export function filterByProject<T extends { project: string }>(
  sessions: T[],
  project: string | null,
): T[] {
  if (!project) {
    return sessions;
  }
  return sessions.filter((session) => session.project === project);
}

// Ledger-style grouping: projects sorted alphabetically, input order (newest
// first) preserved inside each group.
export function groupByProject<T extends { project: string }>(
  sessions: T[],
): { project: string; sessions: T[] }[] {
  return distinctProjects(sessions).map((project) => ({
    project,
    sessions: sessions.filter((session) => session.project === project),
  }));
}

function SessionTitle({ title }: { title: Title }) {
  if (title.kind === "command") {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Token
          className="max-w-full"
          icon={<Command aria-hidden="true" className="size-3.5 shrink-0" />}
          label={title.name}
          size="sm"
        />
        {title.args ? <span className="block truncate text-xs text-muted">{title.args}</span> : null}
      </div>
    );
  }

  if (title.kind === "skill") {
    return (
      <Token
        className="max-w-full"
        icon={<Puzzle aria-hidden="true" className="size-3.5 shrink-0" />}
        label={title.name}
        size="sm"
      />
    );
  }

  if (title.kind === "text") {
    return (
      <span className="block truncate text-sm text-foreground">
        {title.sentence}
      </span>
    );
  }

  return (
    <span className="block truncate text-sm text-muted">
      {title.text.length > 0 ? title.text : "Untitled session"}
    </span>
  );
}

function SessionRow({
  session,
  selected,
}: {
  session: SessionSummary;
  selected: boolean;
}) {
  return (
    <li>
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId: session.id }}
        className={`block border-b border-border px-4 py-2 transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/20 ${
          selected ? "bg-surface-muted" : "hover:bg-surface-hover"
        }`}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <SessionTitle title={session.title} />
            <time
              className="mt-1 block text-xs text-muted"
              dateTime={session.timestamp}
              title={formatTimestamp(session.timestamp)}
            >
              {relativeTime(session.timestamp)}
            </time>
          </div>
          <div className="shrink-0">
            <div className="tabular-nums text-right text-sm font-medium text-foreground">
              {formatCost(session.totalCostUsd)}
            </div>
            <div className="mt-1 tabular-nums text-right text-xs text-muted">
              {formatTokens(session.totalTokens)}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

// Ledger-language group header, matching PiTraceLedger's divider style.
function SessionGroup({
  project,
  sessions,
  selectedSessionId,
}: {
  project: string;
  sessions: SessionSummary[];
  selectedSessionId?: string;
}) {
  return (
    <section data-testid="session-group">
      <header className="flex items-baseline justify-between gap-3 border-b border-border bg-surface-muted/50 px-4 py-1">
        <span className="truncate text-xs font-semibold text-foreground">{project}</span>
        <span className="shrink-0 tabular-nums text-xs text-muted">{sessions.length}</span>
      </header>
      <ol>
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            selected={session.id === selectedSessionId}
          />
        ))}
      </ol>
    </section>
  );
}

export function SessionListPanel({ selectedSessionId }: { selectedSessionId?: string }) {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
  });
  const { refetch } = sessions;
  const allSessions = sessions.data ?? [];
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const projects = useMemo(() => distinctProjects(allSessions), [allSessions]);
  const sessionRows = useMemo(
    () => filterByProject(allSessions, selectedProject),
    [allSessions, selectedProject],
  );

  useRefreshOnWindowFocus(refetch);

  const groups = useMemo(() => groupByProject(sessionRows), [sessionRows]);

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="session-list-panel"
    >
      <div className="border-b border-border px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase text-muted">Trace</h2>
            <p className="mt-1 text-xs text-muted">Historical Pi session traces</p>
          </div>
          <IconButton
            icon={<RefreshCw className={`size-4 ${sessions.isFetching ? "animate-spin" : ""}`} />}
            isDisabled={sessions.isFetching}
            label="Refresh sessions"
            size="sm"
            onClick={() => sessions.refetch()}
          />
        </div>

        <Selector
          isLabelHidden
          label="Filter by project"
          options={[
            { value: "all", label: "All projects" },
            ...projects.map((project) => ({ value: project, label: project })),
          ]}
          size="sm"
          value={selectedProject ?? "all"}
          width="100%"
          onChange={(value) => setSelectedProject(value === "all" ? null : value)}
        />
      </div>

      <div className="pigui-scroll-fade min-h-0 flex-1 overflow-y-auto">
        {sessions.isLoading ? (
          <EmptyState className="px-4 py-10" isCompact title="Loading sessions..." />
        ) : sessions.isError ? (
          <EmptyState
            className="px-4 py-10"
            isCompact
            title="Could not read the Pi agent directory."
          />
        ) : sessionRows.length === 0 ? (
          <EmptyState className="px-4 py-10" isCompact title="No sessions found." />
        ) : (
          groups.map((group) => (
            <SessionGroup
              key={group.project}
              project={group.project}
              sessions={group.sessions}
              selectedSessionId={selectedSessionId}
            />
          ))
        )}
      </div>
    </div>
  );
}
