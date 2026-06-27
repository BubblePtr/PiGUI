import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button, Card, Chip, EmptyState as HeroEmptyState, ScrollShadow } from "@heroui/react";
import { NativeSelect } from "@heroui-pro/react/native-select";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useRefreshOnWindowFocus } from "./refresh";
import {
  formatCost,
  formatTimestamp,
  formatTokens,
  listSessions,
  relativeTime,
  type SessionSummary,
  type Title,
} from "./sessions";

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

function SessionTitle({ title }: { title: Title }) {
  if (title.kind === "command") {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <Chip className="max-w-full" size="sm" variant="soft">
          <span aria-hidden="true" className="shrink-0">
            ⚡
          </span>
          <span className="block truncate">{title.name}</span>
        </Chip>
        {title.args ? <span className="block truncate text-xs text-muted">{title.args}</span> : null}
      </div>
    );
  }

  if (title.kind === "skill") {
    return (
      <Chip className="max-w-full" size="sm" variant="soft">
        <span aria-hidden="true" className="shrink-0">
          🧩
        </span>
        <span className="block truncate">{title.name}</span>
      </Chip>
    );
  }

  if (title.kind === "text") {
    return <span className="block truncate text-sm text-foreground">{title.sentence}</span>;
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
        className={`block border-b border-border px-4 py-3 transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/20 ${
          selected ? "bg-surface-muted" : "hover:bg-surface-hover"
        }`}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <SessionTitle title={session.title} />
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="truncate">{session.project}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={session.timestamp} title={formatTimestamp(session.timestamp)}>
                {relativeTime(session.timestamp)}
              </time>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-foreground">
              {formatCost(session.totalCostUsd)}
            </div>
            <div className="mt-1 text-xs text-muted">{formatTokens(session.totalTokens)}</div>
          </div>
        </div>
      </Link>
    </li>
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

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase text-muted">Analyze / Trace</h2>
            <p className="mt-1 text-xs text-muted">Historical Pi session traces</p>
          </div>
          <Button
            isIconOnly
            aria-label="Refresh sessions"
            isDisabled={sessions.isFetching}
            size="sm"
            variant="outline"
            onPress={() => sessions.refetch()}
          >
            <RefreshCw className={`size-4 ${sessions.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <label className="sr-only" htmlFor="project-filter">
          Filter by project
        </label>
        <NativeSelect fullWidth>
          <NativeSelect.Trigger
            id="project-filter"
            value={selectedProject ?? "all"}
            onChange={(event) =>
              setSelectedProject(event.target.value === "all" ? null : event.target.value)
            }
          >
            <NativeSelect.Option value="all">All projects</NativeSelect.Option>
            {projects.map((project) => (
              <NativeSelect.Option key={project} value={project}>
                {project}
              </NativeSelect.Option>
            ))}
          </NativeSelect.Trigger>
        </NativeSelect>
      </div>

      <ScrollShadow className="min-h-0 flex-1 overflow-y-auto">
        {sessions.isLoading ? (
          <HeroEmptyState className="px-4 py-10 text-sm text-muted">
            Loading sessions...
          </HeroEmptyState>
        ) : sessions.isError ? (
          <HeroEmptyState className="px-4 py-10 text-sm text-danger">
            Could not read the Pi agent directory.
          </HeroEmptyState>
        ) : sessionRows.length === 0 ? (
          <HeroEmptyState className="px-4 py-10 text-sm text-muted">
            No sessions found.
          </HeroEmptyState>
        ) : (
          <ol>
            {sessionRows.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                selected={session.id === selectedSessionId}
              />
            ))}
          </ol>
        )}
      </ScrollShadow>
    </Card>
  );
}
