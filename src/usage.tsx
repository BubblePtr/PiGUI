import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { AppFrame } from "./app-shell";
import { useRefreshOnWindowFocus } from "./refresh";
import {
  formatCost,
  formatDateLabel,
  formatTokens,
  listSessions,
  type NamedCount,
  type SessionSummary,
} from "./sessions";
import {
  aggregateCostByModel,
  aggregateDailyCostByProject,
  aggregateDailyTokens,
  aggregateModelDistribution,
  aggregateSkillCounts,
  aggregateToolCounts,
  type DailyCostByProject,
  type DailyTokenUsage,
  type ModelCost,
  type ModelDistribution,
} from "./usage-aggregation";

const chartColorCount = 8;
const defaultRankLimit = 8;

function projectColor(project: string, projects: string[]) {
  const index = Math.max(0, projects.indexOf(project));
  return `var(--pig-color-chart-${(index % chartColorCount) + 1})`;
}

function heatColor(level: number) {
  return `var(--pig-color-heat-${level})`;
}

function chartColor(index: number) {
  return `var(--pig-color-chart-${(index % chartColorCount) + 1})`;
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function summarizeSessions(sessions: SessionSummary[]) {
  return sessions.reduce(
    (summary, session) => ({
      totalCostUsd: summary.totalCostUsd + session.totalCostUsd,
      totalTokens: summary.totalTokens + session.totalTokens,
      projects: summary.projects.add(session.project),
    }),
    { totalCostUsd: 0, totalTokens: 0, projects: new Set<string>() },
  );
}

function EmptyUsageState({ children }: { children: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-10 text-sm text-muted">
      {children}
    </div>
  );
}

function SectionHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {meta ? <span className="text-xs font-medium text-muted">{meta}</span> : null}
    </div>
  );
}

function ModelCostBreakdown({ models }: { models: ModelCost[] }) {
  const maxCost = Math.max(...models.map((model) => model.costUsd), 0);

  if (models.length === 0) {
    return <EmptyUsageState>No model usage yet.</EmptyUsageState>;
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="grid gap-3">
        {models.map((model, index) => {
          const width = maxCost === 0 ? 0 : Math.max(2, (model.costUsd / maxCost) * 100);

          return (
            <div key={model.model}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">{model.model}</span>
                <span className="shrink-0 text-muted">
                  {formatCost(model.costUsd)} · {formatTokens(model.tokens)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-sm bg-surface-muted">
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${width}%`, backgroundColor: chartColor(index) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelDistributionView({ models }: { models: ModelDistribution[] }) {
  const [mode, setMode] = useState<"cost" | "tokens">("cost");

  if (models.length === 0) {
    return <EmptyUsageState>No model distribution yet.</EmptyUsageState>;
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="mb-4 inline-flex rounded-md border border-border bg-surface-muted p-1">
        {(["cost", "tokens"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${
              mode === item
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:bg-surface-hover hover:text-foreground"
            }`}
            onClick={() => setMode(item)}
          >
            {item === "cost" ? "Cost" : "Tokens"}
          </button>
        ))}
      </div>
      <div className="grid gap-3">
        {models.map((model, index) => {
          const share = mode === "cost" ? model.costShare : model.tokenShare;

          return (
            <div key={model.model}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">{model.model}</span>
                <span className="shrink-0 text-muted">{formatPercent(share)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-sm bg-surface-muted">
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${share * 100}%`, backgroundColor: chartColor(index) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NamedRankList({ items, emptyLabel }: { items: NamedCount[]; emptyLabel: string }) {
  const maxCount = Math.max(...items.map((item) => item.count), 0);

  if (items.length === 0) {
    return <EmptyUsageState>{emptyLabel}</EmptyUsageState>;
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="grid gap-3">
        {items.map((item, index) => {
          const width = maxCount === 0 ? 0 : Math.max(2, (item.count / maxCount) * 100);

          return (
            <div key={item.name}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">{item.name}</span>
                <span className="shrink-0 text-muted">{item.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-sm bg-surface-muted">
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${width}%`, backgroundColor: chartColor(index) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UsageSecondLayer({
  sessions,
  rankLimit = defaultRankLimit,
}: {
  sessions: SessionSummary[];
  rankLimit?: number;
}) {
  const modelCosts = useMemo(() => aggregateCostByModel(sessions), [sessions]);
  const modelDistribution = useMemo(() => aggregateModelDistribution(sessions), [sessions]);
  const toolCounts = useMemo(() => aggregateToolCounts(sessions, rankLimit), [sessions, rankLimit]);
  const skillCounts = useMemo(() => aggregateSkillCounts(sessions, rankLimit), [sessions, rankLimit]);

  return (
    <>
      <section>
        <SectionHeading title="Cost by model" meta="API list price" />
        <ModelCostBreakdown models={modelCosts} />
      </section>

      <section>
        <SectionHeading title="Model distribution" meta="Cost / tokens" />
        <ModelDistributionView models={modelDistribution} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div>
          <SectionHeading title="Tool calls" meta={`Top ${rankLimit}`} />
          <NamedRankList items={toolCounts} emptyLabel="No tool calls yet." />
        </div>
        <div>
          <SectionHeading title="Skill usage" meta={`Top ${rankLimit}`} />
          <NamedRankList items={skillCounts} emptyLabel="No skill usage yet." />
        </div>
      </section>
    </>
  );
}

function usageDateRange(days: Array<{ date: string }>) {
  if (days.length === 0) {
    return "No sessions";
  }
  if (days.length === 1) {
    return formatDateLabel(days[0].date);
  }
  return `${formatDateLabel(days[0].date)} - ${formatDateLabel(days[days.length - 1].date)}`;
}

function UsageSidebar({
  sessions,
  isFetching,
  onRefresh,
}: {
  sessions: SessionSummary[];
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const summary = summarizeSessions(sessions);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase text-muted">用量</h2>
            <p className="mt-1 text-xs text-muted">All sessions, by day</p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-sm transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onRefresh}
            disabled={isFetching}
            title="Refresh usage"
            aria-label="Refresh usage"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4">
        <div className="rounded-md border border-border bg-surface-muted p-3">
          <div className="text-xs font-medium uppercase text-muted">Total cost</div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {formatCost(summary.totalCostUsd)}
          </div>
          <div className="mt-1 text-xs text-muted">API list price</div>
        </div>
        <div className="rounded-md border border-border bg-surface-muted p-3">
          <div className="text-xs font-medium uppercase text-muted">Total tokens</div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {formatTokens(summary.totalTokens)}
          </div>
        </div>
        <div className="rounded-md border border-border bg-surface-muted p-3">
          <div className="text-xs font-medium uppercase text-muted">Projects</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.projects.size}</div>
        </div>
      </div>
    </div>
  );
}

function CostTooltip({ day, projects }: { day: DailyCostByProject; projects: string[] }) {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 -translate-x-1/2 rounded-md border border-border bg-surface px-3 py-2 text-left text-xs shadow-sm group-hover:block">
      <div className="font-semibold text-foreground">{formatDateLabel(day.date)}</div>
      <div className="mt-1 text-muted">Total {formatCost(day.totalCostUsd)}</div>
      <div className="mt-2 grid gap-1">
        {day.projects.length === 0 ? (
          <div className="text-muted">No sessions</div>
        ) : (
          day.projects.map((project) => (
            <div key={project.project} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: projectColor(project.project, projects) }}
                />
                <span className="truncate text-muted">{project.project}</span>
              </span>
              <span className="font-medium text-foreground">{formatCost(project.costUsd)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CostTrendChart({
  days,
  projects,
}: {
  days: DailyCostByProject[];
  projects: string[];
}) {
  const maxCost = Math.max(...days.map((day) => day.totalCostUsd), 0);

  if (days.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface px-4 py-12 text-sm text-muted">
        No sessions found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="flex min-w-[42rem] items-end gap-2">
        {days.map((day) => {
          const height = maxCost === 0 ? 0 : Math.max(4, (day.totalCostUsd / maxCost) * 100);

          return (
            <div key={day.date} className="group relative flex min-w-10 flex-1 flex-col items-center">
              <CostTooltip day={day} projects={projects} />
              <div className="flex h-56 w-full items-end rounded-md bg-surface-muted px-1 pb-1">
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                  style={{ height: `${height}%` }}
                  aria-label={`${formatDateLabel(day.date)} cost ${formatCost(day.totalCostUsd)}`}
                >
                  {day.totalCostUsd === 0 ? (
                    <span className="h-0.5 w-full bg-border" />
                  ) : (
                    day.projects.map((project) => (
                      <span
                        key={project.project}
                        className="w-full"
                        style={{
                          height: `${(project.costUsd / day.totalCostUsd) * 100}%`,
                          backgroundColor: projectColor(project.project, projects),
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
              <div className="mt-2 w-full truncate text-center text-[11px] text-muted">
                {formatDateLabel(day.date)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function heatLevel(tokens: number, maxTokens: number) {
  if (tokens === 0 || maxTokens === 0) {
    return 0;
  }

  return Math.min(4, Math.max(1, Math.ceil((tokens / maxTokens) * 4)));
}

function TokenHeatmap({ days }: { days: DailyTokenUsage[] }) {
  const maxTokens = Math.max(...days.map((day) => day.totalTokens), 0);

  if (days.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface px-4 py-12 text-sm text-muted">
        No token usage yet.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(1.25rem,1fr))] gap-1">
        {days.map((day) => {
          const level = heatLevel(day.totalTokens, maxTokens);

          return (
            <div
              key={day.date}
              className="aspect-square rounded-sm border border-border"
              style={{ backgroundColor: heatColor(level) }}
              title={`${formatDateLabel(day.date)}: ${formatTokens(day.totalTokens)} tokens`}
              aria-label={`${formatDateLabel(day.date)} tokens ${day.totalTokens}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="size-3 rounded-sm border border-border"
            style={{ backgroundColor: heatColor(level) }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

export function UsagePage() {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
  });
  const allSessions = sessions.data ?? [];
  const costDays = useMemo(() => aggregateDailyCostByProject(allSessions), [allSessions]);
  const tokenDays = useMemo(() => aggregateDailyTokens(allSessions), [allSessions]);
  const projects = useMemo(
    () => Array.from(new Set(allSessions.map((session) => session.project))).sort(),
    [allSessions],
  );

  useRefreshOnWindowFocus(sessions.refetch);

  return (
    <AppFrame
      sidebar={
        <UsageSidebar
          sessions={allSessions}
          isFetching={sessions.isFetching}
          onRefresh={() => sessions.refetch()}
        />
      }
    >
      <article className="min-h-full px-6 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <header className="border-b border-border pb-4">
            <div className="text-sm font-semibold uppercase text-muted">Usage</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
              Cost and token trends
            </h1>
            <p className="mt-2 text-sm text-muted">
              {usageDateRange(costDays)} · Cost is shown as API list price.
            </p>
          </header>

          {sessions.isError ? (
            <div className="rounded-md border border-border bg-surface px-4 py-12 text-sm text-danger">
              Could not read the Pi agent directory.
            </div>
          ) : sessions.isLoading ? (
            <div className="rounded-md border border-border bg-surface px-4 py-12 text-sm text-muted">
              Loading usage...
            </div>
          ) : (
            <>
              <section>
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Daily cost by project</h2>
                    <p className="mt-1 text-sm text-muted">
                      Stacked daily bars, grouped by project.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-muted">API list price</span>
                </div>
                <CostTrendChart days={costDays} projects={projects} />
              </section>

              <section>
                <div className="mb-3">
                  <h2 className="text-base font-semibold text-foreground">Daily token heatmap</h2>
                  <p className="mt-1 text-sm text-muted">
                    Calendar-style intensity from all indexed sessions.
                  </p>
                </div>
                <TokenHeatmap days={tokenDays} />
              </section>

              <UsageSecondLayer sessions={allSessions} />
            </>
          )}
        </div>
      </article>
    </AppFrame>
  );
}
