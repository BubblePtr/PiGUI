import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { Token } from "@astryxdesign/core/Token";
import { Tokenizer } from "@astryxdesign/core/Tokenizer";
import { createStaticSource, type SearchableItem } from "@astryxdesign/core/Typeahead";
import { useMemo, useState } from "react";
import { Archive, Command, Puzzle } from "@/shared/ui/icons";
import { useRefreshOnWindowFocus } from "@/shared/refresh";
import {
  formatCost,
  formatTimestamp,
  formatTokens,
  listSessions,
  relativeTime,
  type SessionPresence,
  type SessionSummary,
  type Title,
} from "@/entities/session/sessions";

// Distinct project names for the filter control, sorted for a stable menu.
export function distinctProjects<T extends { project: string }>(sessions: T[]): string[] {
  return Array.from(new Set(sessions.map((session) => session.project))).sort((a, b) =>
    a.localeCompare(b),
  );
}

// No selected projects means "all projects" — the list is shown unfiltered;
// otherwise sessions from any selected project pass (union).
export function filterByProjects<T extends { project: string }>(
  sessions: T[],
  projects: string[],
): T[] {
  if (projects.length === 0) {
    return sessions;
  }
  const wanted = new Set(projects);
  return sessions.filter((session) => wanted.has(session.project));
}

// Color as identity: the same project always hashes to the same Token color,
// so chips stay recognizable across sessions. Red is excluded — it reads as
// an error state, not a category.
const projectTokenColors = [
  "blue",
  "green",
  "teal",
  "cyan",
  "purple",
  "pink",
  "orange",
  "yellow",
] as const;

export function projectTokenColor(project: string): (typeof projectTokenColors)[number] {
  let hash = 0;
  for (const char of project) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return projectTokenColors[hash % projectTokenColors.length];
}

// Archived Sessions stay listed (archive is a visibility change, not a
// deletion — see CONTEXT.md "Archived Session"); presence is a facet the
// user can narrow by, defaulting to everything.
export type SessionPresenceFilter = "all" | SessionPresence;

const sessionPresenceOptions: { value: SessionPresenceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "external", label: "External" },
];

function isSessionPresenceFilter(value: unknown): value is SessionPresenceFilter {
  return sessionPresenceOptions.some((option) => option.value === value);
}

export function filterByPresence<T extends { presence: SessionPresence }>(
  sessions: T[],
  presence: SessionPresenceFilter,
): T[] {
  return presence === "all" ? sessions : sessions.filter((s) => s.presence === presence);
}

// Flat recency view: the newest session wins no matter which project it
// belongs to, so a multi-project day reads as one chronological stream.
export function sortByRecency<T extends { timestamp: string }>(sessions: T[]): T[] {
  return [...sessions].sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

export type SessionListOrder = "recent" | "project";

export const sessionListOrderStorageKey = "pigui.sessionListOrder.v1";

const sessionListOrderOptions: { id: SessionListOrder; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "project", label: "Project" },
];

function isSessionListOrder(value: unknown): value is SessionListOrder {
  return value === "recent" || value === "project";
}

// The order choice is a per-machine viewing preference, not session data, so
// it lives in localStorage like the sidebar project expansion state.
export function readSessionListOrder(): SessionListOrder {
  try {
    const stored = window.localStorage.getItem(sessionListOrderStorageKey);
    return isSessionListOrder(stored) ? stored : "recent";
  } catch {
    return "recent";
  }
}

function writeSessionListOrder(order: SessionListOrder) {
  try {
    window.localStorage.setItem(sessionListOrderStorageKey, order);
  } catch {
    // Storage may be unavailable (private mode, quota); the choice then lasts for the session only.
  }
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
  showProject = false,
}: {
  session: SessionSummary;
  selected: boolean;
  // In the flat recency view the group header is gone, so each row carries
  // its project chip; grouped rows omit it to avoid repeating the header.
  showProject?: boolean;
}) {
  return (
    <li>
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId: session.id }}
        aria-current={selected ? "page" : undefined}
        className={`block px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/20 ${
          selected ? "bg-surface-muted" : "hover:bg-surface-hover"
        }`}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <SessionTitle title={session.title} />
            <div className="mt-1 flex min-w-0 items-center gap-2">
              {showProject ? (
                <Token
                  className="max-w-[60%]"
                  color={projectTokenColor(session.project)}
                  data-testid="session-row-project"
                  label={session.project}
                  size="sm"
                />
              ) : null}
              {session.presence === "archived" ? (
                // Icon-only: a labelled chip does not fit beside the project
                // chip and the timestamp in the 320px finder.
                <span
                  aria-label="Archived"
                  className="inline-flex shrink-0 text-muted"
                  data-testid="session-row-archived"
                  role="img"
                  title="Archived"
                >
                  <Archive aria-hidden="true" className="size-3.5" />
                </span>
              ) : null}
              <time
                className="block truncate text-xs text-muted"
                dateTime={session.timestamp}
                title={formatTimestamp(session.timestamp)}
              >
                {relativeTime(session.timestamp)}
              </time>
            </div>
          </div>
          <div className="shrink-0">
            <div className="tabular-nums text-right text-xs text-muted">
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

// Group headers sit a full hierarchy level above rows: sticky uppercase
// micro-labels with loosened tracking on an opaque background, groups
// separated by whitespace rather than yet another border weight.
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
      <header className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b border-separator bg-background px-4 py-1.5">
        <span
          className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted"
          data-testid="session-group-project"
        >
          {project}
        </span>
        <span className="shrink-0 tabular-nums text-[11px] text-muted">{sessions.length}</span>
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
  const [selectedProjects, setSelectedProjects] = useState<SearchableItem[]>([]);
  const [order, setOrder] = useState<SessionListOrder>(readSessionListOrder);
  const [presence, setPresence] = useState<SessionPresenceFilter>("all");
  const projects = useMemo(() => distinctProjects(allSessions), [allSessions]);
  const projectSource = useMemo(
    () => createStaticSource(projects.map((project) => ({ id: project, label: project }))),
    [projects],
  );
  const sessionRows = useMemo(
    () =>
      filterByPresence(
        filterByProjects(
          allSessions,
          selectedProjects.map((item) => item.label),
        ),
        presence,
      ),
    [allSessions, selectedProjects, presence],
  );

  useRefreshOnWindowFocus(refetch);

  const groups = useMemo(() => groupByProject(sessionRows), [sessionRows]);
  const recentRows = useMemo(() => sortByRecency(sessionRows), [sessionRows]);

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="session-list-panel"
    >
      <div className="border-b border-border px-4 py-3">
        <HStack gap={2} vAlign="center">
          {/* Multi-select filter: chosen projects render as removable token
              chips; an empty set means "all projects". */}
          <Tokenizer
            className="min-w-0 flex-1"
            hasClear
            hasEntriesOnFocus
            isLabelHidden
            label="Filter by projects"
            placeholder="All projects"
            renderToken={(item, onRemove) => (
              <Token
                color={projectTokenColor(item.label)}
                label={item.label}
                size="sm"
                onRemove={onRemove}
              />
            )}
            searchSource={projectSource}
            size="sm"
            tokenOverflowBehavior="unfocusedInline"
            value={selectedProjects}
            width="100%"
            onChange={(items) => setSelectedProjects(items)}
          />
        </HStack>
        {/* View switcher sits under the filter: Recent is one chronological
            stream across projects, Project is the grouped ledger. */}
        <div className="mt-3 flex items-center gap-2">
          <SegmentedControl
            label="Session list order"
            layout="fill"
            size="sm"
            value={order}
            onChange={(value) => {
              if (!isSessionListOrder(value)) {
                return;
              }
              setOrder(value);
              writeSessionListOrder(value);
            }}
          >
            {sessionListOrderOptions.map((option) => (
              <SegmentedControlItem key={option.id} label={option.label} value={option.id} />
            ))}
          </SegmentedControl>
          <Selector
            isLabelHidden
            label="Presence"
            options={sessionPresenceOptions}
            size="sm"
            value={presence}
            variant="ghost"
            onChange={(value) => {
              if (isSessionPresenceFilter(value)) {
                setPresence(value);
              }
            }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
        ) : order === "recent" ? (
          <ol data-testid="session-recent-list">
            {recentRows.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                selected={session.id === selectedSessionId}
                showProject
              />
            ))}
          </ol>
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
