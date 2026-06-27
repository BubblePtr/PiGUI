import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState as HeroEmptyState,
  ProgressBar,
  ScrollShadow,
  Tabs,
  Tooltip,
} from "@heroui/react";
import { BarChart } from "@heroui-pro/react/bar-chart";
import { KPI } from "@heroui-pro/react/kpi";
import { Segment } from "@heroui-pro/react/segment";
import { RefreshCw } from "lucide-react";
import { useMemo, useState, type ComponentProps } from "react";
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
  buildTrailingAnnualTokenHeatmap,
  aggregateModelDistribution,
  aggregateSkillCounts,
  aggregateToolCounts,
  bucketCostByProject,
  type CostByProjectBucket,
  type CostTrendGranularity,
  type DailyCostByProject,
  type DailyTokenUsage,
  type ModelCost,
  type ModelDistribution,
} from "./usage-aggregation";

const chartColorCount = 5;
const defaultRankLimit = 8;
const costTrendGranularityOptions: Array<{ id: CostTrendGranularity; label: string }> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "cumulative", label: "Cumulative" },
];
const costTrendGranularityTitles: Record<CostTrendGranularity, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Annual",
  cumulative: "Cumulative",
};
type TokenActivityMode = "daily" | "weekly" | "cumulative";
const tokenActivityModeOptions: Array<{ id: TokenActivityMode; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "cumulative", label: "Cumulative" },
];

function projectColor(project: string, projects: string[]) {
  const index = Math.max(0, projects.indexOf(project));
  return chartColor(index);
}

function heatColor(level: number) {
  if (level === 0) {
    return "var(--surface-secondary)";
  }

  return chartColor(level - 1);
}

function chartColor(index: number) {
  return `var(--chart-${(index % chartColorCount) + 1})`;
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function isCostTrendGranularity(value: string): value is CostTrendGranularity {
  return costTrendGranularityOptions.some((option) => option.id === value);
}

function isTokenActivityMode(value: string): value is TokenActivityMode {
  return tokenActivityModeOptions.some((option) => option.id === value);
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

export function UsageSummaryPanel({
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
          <Tooltip delay={0}>
            <Tooltip.Trigger
              className="inline-flex"
              data-testid="usage-refresh-tooltip-trigger"
            >
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
            </Tooltip.Trigger>
            <Tooltip.Content>Refresh usage data</Tooltip.Content>
          </Tooltip>
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

type CostTrendChartDatum = Record<string, number | string> & {
  key: string;
  label: string;
  tooltipLabel: string;
};

type CostTrendSeries = {
  color: string;
  dataKey: string;
  project: string;
};

type CostTrendTooltipContentProps = ComponentProps<typeof BarChart.TooltipContent>;

function formatMonthLabel(key: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(new Date(`${key}-01T00:00:00.000Z`));
}

function formatCostBucketLabel(bucket: CostByProjectBucket, granularity: CostTrendGranularity) {
  if (granularity === "month") {
    return formatMonthLabel(bucket.key);
  }
  if (granularity === "year") {
    return bucket.key;
  }
  if (granularity === "cumulative") {
    return "Total";
  }
  return formatDateLabel(bucket.startDate);
}

function formatCostBucketTooltipLabel(
  bucket: CostByProjectBucket,
  granularity: CostTrendGranularity,
) {
  if (granularity === "week") {
    return `Week of ${formatDateLabel(bucket.startDate)}`;
  }
  if (granularity === "cumulative") {
    return `${formatDateLabel(bucket.startDate)} - ${formatDateLabel(bucket.endDate)}`;
  }
  return formatCostBucketLabel(bucket, granularity);
}

function CostTrendTooltipContent({ payload, label, ...props }: CostTrendTooltipContentProps) {
  const nonZeroPayload = payload?.filter((entry) => Number(entry.value ?? 0) > 0);
  const tooltipLabel = nonZeroPayload?.[0]?.payload?.tooltipLabel ?? payload?.[0]?.payload?.tooltipLabel;

  return (
    <BarChart.TooltipContent
      {...props}
      label={typeof tooltipLabel === "string" ? tooltipLabel : label}
      payload={nonZeroPayload?.length ? nonZeroPayload : payload}
      valueFormatter={(value) => formatCost(Number(value))}
    />
  );
}

export function CostTrendChart({
  days,
  granularity,
  projects,
}: {
  days: DailyCostByProject[];
  granularity: CostTrendGranularity;
  projects: string[];
}) {
  const buckets = useMemo(() => bucketCostByProject(days, granularity), [days, granularity]);
  const series = useMemo<CostTrendSeries[]>(
    () =>
      projects.map((project, index) => ({
        color: projectColor(project, projects),
        dataKey: `project_${index}`,
        project,
      })),
    [projects],
  );
  const data = useMemo<CostTrendChartDatum[]>(
    () =>
      buckets.map((bucket) => {
        const costsByProject = new Map(
          bucket.projects.map((project) => [project.project, project.costUsd]),
        );
        const datum: CostTrendChartDatum = {
          key: bucket.key,
          label: formatCostBucketLabel(bucket, granularity),
          tooltipLabel: formatCostBucketTooltipLabel(bucket, granularity),
        };

        for (const item of series) {
          datum[item.dataKey] = costsByProject.get(item.project) ?? 0;
        }

        return datum;
      }),
    [buckets, granularity, series],
  );
  const isScrollable = data.length > 12;
  const chartWidth = Math.max(672, data.length * 72);
  const chartAriaLabel = `${costTrendGranularityTitles[granularity]} cost by project chart`;

  if (days.length === 0) {
    return (
      <HeroEmptyState className="bg-surface px-4 py-12 text-sm text-muted">
        No sessions found.
      </HeroEmptyState>
    );
  }

  const chart = (
    <BarChart
      aria-label={chartAriaLabel}
      className="overflow-visible"
      data={data}
      height={320}
      margin={{ bottom: 0, left: 0, right: 12, top: 24 }}
      role="img"
      style={isScrollable ? { minWidth: chartWidth } : undefined}
      width="100%"
    >
      <BarChart.Grid vertical={false} />
      <BarChart.XAxis
        axisLine={false}
        dataKey="label"
        interval={0}
        minTickGap={8}
        tickLine={false}
        tickMargin={10}
      />
      <BarChart.YAxis domain={[0, "dataMax"]} hide />
      <BarChart.Tooltip
        allowEscapeViewBox={{ x: false, y: true }}
        content={<CostTrendTooltipContent />}
        cursor={{ fill: "var(--surface-tertiary)" }}
        isAnimationActive={false}
        offset={12}
        position={{ y: 16 }}
        reverseDirection={{ x: true, y: false }}
        shared
        wrapperStyle={{
          outline: "none",
          pointerEvents: "none",
          zIndex: 30,
        }}
      />
      {series.map((item) => (
        <BarChart.Bar
          key={item.dataKey}
          dataKey={item.dataKey}
          fill={item.color}
          isAnimationActive={false}
          maxBarSize={48}
          name={item.project}
          stackId="cost"
        />
      ))}
    </BarChart>
  );

  return (
    <Card className="overflow-visible">
      <Card.Content>
        <div className="relative">
          {isScrollable ? (
            <ScrollShadow
              className="overflow-x-auto overflow-y-visible pt-2"
              data-granularity={granularity}
              data-scrollable="true"
              data-testid="cost-trend-chart-viewport"
              hideScrollBar={false}
              orientation="horizontal"
              size={32}
            >
              {chart}
            </ScrollShadow>
          ) : (
            <div
              className="overflow-visible pt-2"
              data-granularity={granularity}
              data-scrollable="false"
              data-testid="cost-trend-chart-viewport"
            >
              {chart}
            </div>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}

export function CostTrendSection({
  days,
  projects,
}: {
  days: DailyCostByProject[];
  projects: string[];
}) {
  const [granularity, setGranularity] = useState<CostTrendGranularity>("month");
  const title = `${costTrendGranularityTitles[granularity]} cost by project`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted">Stacked bars, grouped by project.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <SharedElementTransition>
            <Segment
              aria-label="Cost trend granularity"
              selectedKey={granularity}
              size="sm"
              onSelectionChange={(key) => {
                const value = String(key);
                setGranularity(isCostTrendGranularity(value) ? value : "month");
              }}
            >
              {costTrendGranularityOptions.map((option) => (
                <Segment.Item key={option.id} id={option.id}>
                  <Segment.Separator />
                  {option.label}
                </Segment.Item>
              ))}
            </Segment>
          </SharedElementTransition>
          <span className="text-xs font-medium text-muted">API list price</span>
        </div>
      </div>
      <CostTrendChart days={days} granularity={granularity} projects={projects} />
    </section>
  );
}

function heatLevel(tokens: number, maxTokens: number) {
  if (tokens === 0 || maxTokens === 0) {
    return 0;
  }

  return Math.min(4, Math.max(1, Math.ceil((tokens / maxTokens) * 4)));
}

function tokenActivityValues(
  days: Array<{ date: string; totalTokens: number; weekIndex: number }>,
  mode: TokenActivityMode,
) {
  const values = new Map<string, number>();

  if (mode === "weekly") {
    const weekTotals = new Map<number, number>();
    for (const day of days) {
      weekTotals.set(day.weekIndex, (weekTotals.get(day.weekIndex) ?? 0) + day.totalTokens);
    }
    for (const day of days) {
      values.set(day.date, weekTotals.get(day.weekIndex) ?? 0);
    }
    return values;
  }

  let cumulative = 0;
  for (const day of days) {
    cumulative += day.totalTokens;
    values.set(day.date, mode === "cumulative" ? cumulative : day.totalTokens);
  }

  return values;
}

export function TokenHeatmap({ days }: { days: DailyTokenUsage[] }) {
  const [mode, setMode] = useState<TokenActivityMode>("daily");
  const heatmap = useMemo(() => buildTrailingAnnualTokenHeatmap(days), [days]);
  const activityValues = useMemo(
    () => (heatmap ? tokenActivityValues(heatmap.days, mode) : new Map<string, number>()),
    [heatmap, mode],
  );
  const maxTokens = Math.max(...activityValues.values(), 0);

  if (!heatmap) {
    return (
      <HeroEmptyState className="bg-surface px-4 py-12 text-sm text-muted">
        No token usage yet.
      </HeroEmptyState>
    );
  }

  return (
    <Card className="overflow-visible">
      <Card.Content>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-foreground">Token activity</h2>
          <Tabs
            selectedKey={mode}
            onSelectionChange={(key) => {
              const value = String(key);
              setMode(isTokenActivityMode(value) ? value : "daily");
            }}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Token activity aggregation">
                {tokenActivityModeOptions.map((option) => (
                  <Tabs.Tab key={option.id} id={option.id}>
                    {option.label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>
        <ScrollShadow
          className="overflow-x-auto pb-1"
          hideScrollBar
          orientation="horizontal"
          size={32}
        >
          <div className="w-full min-w-[48rem] lg:min-w-0" data-testid="token-heatmap-calendar">
            <div className="grid gap-1">
              <div
                className="grid gap-1"
                data-day-count={heatmap.days.length}
                data-mode={mode}
                data-testid="token-heatmap-grid"
                data-year={heatmap.year}
                style={{
                  gridTemplateColumns: `repeat(${heatmap.weekCount}, minmax(0, 1fr))`,
                }}
              >
                {heatmap.days.map((day) => {
                  const activityValue = activityValues.get(day.date) ?? 0;
                  const level = heatLevel(activityValue, maxTokens);

                  return (
                    <div
                      key={day.date}
                      aria-label={`${formatDateLabel(day.date)} tokens ${day.totalTokens}`}
                      className="aspect-square rounded-full border border-border"
                      data-activity-value={activityValue}
                      data-date={day.date}
                      data-token-day
                      data-tokens={day.totalTokens}
                      style={{
                        backgroundColor: heatColor(level),
                        gridColumnStart: day.weekIndex + 1,
                        gridRowStart: day.weekdayIndex + 1,
                      }}
                      title={`${formatDateLabel(day.date)}: ${formatTokens(day.totalTokens)} tokens`}
                    />
                  );
                })}
              </div>
              <div
                aria-hidden
                className="mt-3 grid gap-1 text-sm leading-none text-muted"
                style={{
                  gridTemplateColumns: `repeat(${heatmap.weekCount}, minmax(0, 1fr))`,
                }}
              >
                {heatmap.monthLabels.map((month, index) => {
                  const nextMonth = heatmap.monthLabels[index + 1];

                  return (
                    <span
                      key={month.label}
                      className="text-left"
                      data-month-label={month.label}
                      style={{
                        gridColumnEnd: nextMonth
                          ? nextMonth.weekIndex + 1
                          : heatmap.weekCount + 1,
                        gridColumnStart: month.weekIndex + 1,
                      }}
                    >
                      {month.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollShadow>
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
            <div className="text-sm font-semibold uppercase text-muted">Analyze / Usage</div>
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

              <CostTrendSection days={costDays} projects={projects} />

              <section>
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
