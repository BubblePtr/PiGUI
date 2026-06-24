import { useQuery } from "@tanstack/react-query";
import { Button, Card, EmptyState as HeroEmptyState, ProgressBar } from "@heroui/react";
import { KPI, Segment } from "@heroui-pro/react";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { SharedElementTransition } from "react-aria-components/SharedElementTransition";
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
    <HeroEmptyState className="bg-surface px-4 py-10 text-sm text-muted">
      {children}
    </HeroEmptyState>
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
    <Card>
      <Card.Content>
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
              <ProgressBar aria-label={`${model.model} cost share`} value={width}>
                <ProgressBar.Track>
                  <ProgressBar.Fill style={{ backgroundColor: chartColor(index) }} />
                </ProgressBar.Track>
              </ProgressBar>
            </div>
          );
        })}
      </div>
      </Card.Content>
    </Card>
  );
}

function ModelDistributionView({ models }: { models: ModelDistribution[] }) {
  const [mode, setMode] = useState<"cost" | "tokens">("cost");

  if (models.length === 0) {
    return <EmptyUsageState>No model distribution yet.</EmptyUsageState>;
  }

  return (
    <Card>
      <Card.Content>
      <SharedElementTransition>
        <Segment
          className="mb-4"
          selectedKey={mode}
          size="sm"
          onSelectionChange={(key) => setMode(key === "tokens" ? "tokens" : "cost")}
        >
          <Segment.Item id="cost">
            <Segment.Separator />
            Cost
          </Segment.Item>
          <Segment.Item id="tokens">
            <Segment.Separator />
            Tokens
          </Segment.Item>
        </Segment>
      </SharedElementTransition>
      <div className="grid gap-3">
        {models.map((model, index) => {
          const share = mode === "cost" ? model.costShare : model.tokenShare;

          return (
            <div key={model.model}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">{model.model}</span>
                <span className="shrink-0 text-muted">{formatPercent(share)}</span>
              </div>
              <ProgressBar aria-label={`${model.model} ${mode} share`} value={share * 100}>
                <ProgressBar.Track>
                  <ProgressBar.Fill style={{ backgroundColor: chartColor(index) }} />
                </ProgressBar.Track>
              </ProgressBar>
            </div>
          );
        })}
      </div>
      </Card.Content>
    </Card>
  );
}

function NamedRankList({ items, emptyLabel }: { items: NamedCount[]; emptyLabel: string }) {
  const maxCount = Math.max(...items.map((item) => item.count), 0);

  if (items.length === 0) {
    return <EmptyUsageState>{emptyLabel}</EmptyUsageState>;
  }

  return (
    <Card>
      <Card.Content>
      <div className="grid gap-3">
        {items.map((item, index) => {
          const width = maxCount === 0 ? 0 : Math.max(2, (item.count / maxCount) * 100);

          return (
            <div key={item.name}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">{item.name}</span>
                <span className="shrink-0 text-muted">{item.count}</span>
              </div>
              <ProgressBar aria-label={`${item.name} count share`} value={width}>
                <ProgressBar.Track>
                  <ProgressBar.Fill style={{ backgroundColor: chartColor(index) }} />
                </ProgressBar.Track>
              </ProgressBar>
            </div>
          );
        })}
      </div>
      </Card.Content>
    </Card>
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

function UsageSummaryPanel({
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
    <Card>
      <Card.Content>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Usage summary</h2>
            <p className="mt-1 text-xs text-muted">All sessions, by day</p>
          </div>
          <Button
            isIconOnly
            aria-label="Refresh usage"
            isDisabled={isFetching}
            size="sm"
            variant="outline"
            onPress={onRefresh}
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

      <div className="grid gap-3 md:grid-cols-3">
        <KPI>
          <KPI.Content>
            <KPI.Title>Total cost</KPI.Title>
            <KPI.Value
              currency="USD"
              maximumFractionDigits={6}
              minimumFractionDigits={4}
              style="currency"
              value={summary.totalCostUsd}
            />
          </KPI.Content>
          <KPI.Footer className="text-xs text-muted">API list price</KPI.Footer>
        </KPI>
        <KPI>
          <KPI.Content>
            <KPI.Title>Total tokens</KPI.Title>
            <KPI.Value maximumFractionDigits={1} notation="compact" value={summary.totalTokens} />
          </KPI.Content>
        </KPI>
        <KPI>
          <KPI.Content>
            <KPI.Title>Projects</KPI.Title>
            <KPI.Value value={summary.projects.size} />
          </KPI.Content>
        </KPI>
      </div>
      </Card.Content>
    </Card>
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
      <HeroEmptyState className="bg-surface px-4 py-12 text-sm text-muted">
        No sessions found.
      </HeroEmptyState>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <Card.Content>
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
      </Card.Content>
    </Card>
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
      <HeroEmptyState className="bg-surface px-4 py-12 text-sm text-muted">
        No token usage yet.
      </HeroEmptyState>
    );
  }

  return (
    <Card>
      <Card.Content>
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
      </Card.Content>
    </Card>
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
    <AppFrame>
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
            <HeroEmptyState className="bg-surface px-4 py-12 text-sm text-danger">
              Could not read the Pi agent directory.
            </HeroEmptyState>
          ) : sessions.isLoading ? (
            <HeroEmptyState className="bg-surface px-4 py-12 text-sm text-muted">
              Loading usage...
            </HeroEmptyState>
          ) : (
            <>
              <UsageSummaryPanel
                sessions={allSessions}
                isFetching={sessions.isFetching}
                onRefresh={() => sessions.refetch()}
              />

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
