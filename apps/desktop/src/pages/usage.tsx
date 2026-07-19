import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  EmptyState as HeroEmptyState,
  ProgressBar,
  ScrollShadow,
  Tooltip,
} from "@heroui/react";
import { BarChart } from "@heroui-pro/react/bar-chart";
import { KPI } from "@heroui-pro/react/kpi";
import { Segment } from "@heroui-pro/react/segment";
import { useMemo, useState, type ComponentProps } from "react";
import { SharedElementTransition } from "react-aria-components/SharedElementTransition";
import { Cell, Pie, PieChart, Tooltip as RechartsTooltip } from "recharts";
import { AppFrame } from "@/app/app-shell";
import { RefreshCw } from "@/shared/ui/icons";
import { useRefreshOnWindowFocus } from "@/shared/refresh";
import {
  formatCost,
  formatDateLabel,
  formatTokens,
  listSessions,
  type NamedCount,
  type SessionSummary,
} from "@/entities/session/sessions";
import {
  aggregateDailyTokens,
  aggregateDailyTokensByProject,
  aggregateModelDistribution,
  aggregateSkillCounts,
  aggregateToolCounts,
  bucketTokenUsageByProject,
  buildTrailingAnnualTokenHeatmap,
  type DailyTokensByProject,
  type DailyTokenUsage,
  type ModelDistribution,
  type TokenUsageBucket,
  type UsageTrendPreset,
} from "@/entities/session/usage-aggregation";

const chartColorCount = 5;
const defaultRankLimit = 8;
const usageCardContentClass = "p-5";
const usageTrendBarSize = 14;
const usageChartColors = [
  "var(--pigui-data-blue)",
  "var(--pigui-data-orange)",
  "var(--pigui-data-amber)",
  "var(--pigui-data-coral)",
  "var(--pigui-data-slate)",
];
const usageTrendPresetOptions: Array<{
  id: UsageTrendPreset;
  label: string;
  description: string;
}> = [
  { id: "30d", label: "30D", description: "Daily buckets · last 30 days" },
  { id: "12w", label: "12W", description: "Weekly buckets · last 12 weeks" },
  { id: "12m", label: "12M", description: "Monthly buckets · last 12 months" },
] as const;

function projectColor(project: string, projects: string[]) {
  const index = Math.max(0, projects.indexOf(project));
  return chartColor(index);
}

function heatColor(level: number) {
  return [
    "var(--surface-secondary)",
    "var(--pigui-data-peach)",
    "var(--pigui-data-coral)",
    "var(--pigui-data-orange)",
    "var(--pigui-data-orange-strong)",
  ][level];
}

function chartColor(index: number) {
  return usageChartColors[index % chartColorCount];
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function isUsageTrendPreset(value: string): value is UsageTrendPreset {
  return usageTrendPresetOptions.some((option) => option.id === value);
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

function NamedRankList({
  title,
  meta,
  items,
  emptyLabel,
}: {
  title: string;
  meta: string;
  items: NamedCount[];
  emptyLabel: string;
}) {
  const maxCount = Math.max(...items.map((item) => item.count), 0);

  return (
    <Card>
      <Card.Content className={usageCardContentClass} data-testid="rank-card-content">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted">{meta}</p>
          </div>
          <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs text-muted">
            Top {Math.min(defaultRankLimit, items.length || defaultRankLimit)}
          </span>
        </div>
        {items.length === 0 ? (
          <EmptyUsageState>{emptyLabel}</EmptyUsageState>
        ) : (
          <div className="grid gap-3">
            {items.map((item, index) => {
              const width = maxCount === 0 ? 0 : Math.max(2, (item.count / maxCount) * 100);

              return (
                <div key={item.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {item.name}
                    </span>
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
        )}
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
  const toolCounts = useMemo(() => aggregateToolCounts(sessions, rankLimit), [sessions, rankLimit]);
  const skillCounts = useMemo(() => aggregateSkillCounts(sessions, rankLimit), [sessions, rankLimit]);

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <NamedRankList
        emptyLabel="No tool calls yet."
        items={toolCounts}
        meta="Most-used tools across all sessions"
        title="Tool calls"
      />
      <NamedRankList
        emptyLabel="No skill usage yet."
        items={skillCounts}
        meta="Most-used skills across all sessions"
        title="Skill usage"
      />
    </section>
  );
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
    <section className="relative" data-testid="usage-summary">
      <Tooltip delay={0}>
        <Tooltip.Trigger
          className="absolute right-3 top-3 z-10 inline-flex"
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPI>
          <KPI.Header>
            <KPI.Title>Total cost</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value
              className="tabular-nums text-[var(--pigui-data-blue)]"
              currency="USD"
              maximumFractionDigits={2}
              minimumFractionDigits={2}
              style="currency"
              value={summary.totalCostUsd}
            />
          </KPI.Content>
        </KPI>
        <KPI>
          <KPI.Header>
            <KPI.Title>Total tokens</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value
              className="tabular-nums text-[var(--pigui-data-blue)]"
              maximumFractionDigits={1}
              notation="compact"
              value={summary.totalTokens}
            />
          </KPI.Content>
        </KPI>
        <KPI>
          <KPI.Header>
            <KPI.Title>Sessions</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value
              className="tabular-nums text-[var(--pigui-data-blue)]"
              value={sessions.length}
            />
          </KPI.Content>
        </KPI>
        <KPI>
          <KPI.Header>
            <KPI.Title>Projects</KPI.Title>
          </KPI.Header>
          <KPI.Content>
            <KPI.Value
              className="tabular-nums text-[var(--pigui-data-blue)]"
              value={summary.projects.size}
            />
          </KPI.Content>
        </KPI>
      </div>
    </section>
  );
}

type UsageTrendChartDatum = Record<string, number | string> & {
  key: string;
  label: string;
  tooltipLabel: string;
};

type UsageTrendSeries = {
  color: string;
  dataKey: string;
  project: string;
};

type UsageTrendTooltipContentProps = ComponentProps<typeof BarChart.TooltipContent>;

function UsageTrendTooltipContent({ payload, label, ...props }: UsageTrendTooltipContentProps) {
  const nonZeroPayload = payload?.filter((entry) => Number(entry.value ?? 0) > 0);
  if (!nonZeroPayload?.length) {
    return null;
  }

  const tooltipLabel = nonZeroPayload[0]?.payload?.tooltipLabel;

  return (
    <BarChart.TooltipContent
      {...props}
      label={typeof tooltipLabel === "string" ? tooltipLabel : label}
      payload={nonZeroPayload}
      valueFormatter={(value) => `${formatTokens(Number(value))} tokens`}
    />
  );
}

function usageTrendLabel(bucket: TokenUsageBucket, preset: UsageTrendPreset) {
  if (preset === "12m") {
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(
      new Date(`${bucket.startDate}T00:00:00.000Z`),
    );
  }
  return formatDateLabel(bucket.startDate);
}

function usageTrendTooltipLabel(bucket: TokenUsageBucket) {
  if (bucket.startDate === bucket.endDate) {
    return formatDateLabel(bucket.startDate);
  }
  return `${formatDateLabel(bucket.startDate)} – ${formatDateLabel(bucket.endDate)}`;
}

export function UsageTrendChart({
  days,
  projects,
  preset,
}: {
  days: DailyTokensByProject[];
  projects: string[];
  preset: UsageTrendPreset;
}) {
  const buckets = useMemo(() => bucketTokenUsageByProject(days, preset), [days, preset]);
  const series = useMemo<UsageTrendSeries[]>(
    () =>
      projects.map((project, index) => ({
        color: projectColor(project, projects),
        dataKey: `project_${index}`,
        project,
      })),
    [projects],
  );
  const data = useMemo<UsageTrendChartDatum[]>(
    () =>
      buckets.map((bucket) => {
        const tokensByProject = new Map(
          bucket.projects.map((project) => [project.project, project.tokens]),
        );
        const datum: UsageTrendChartDatum = {
          key: bucket.key,
          label: usageTrendLabel(bucket, preset),
          tooltipLabel: usageTrendTooltipLabel(bucket),
        };

        for (const item of series) {
          datum[item.dataKey] = tokensByProject.get(item.project) ?? 0;
        }

        return datum;
      }),
    [buckets, preset, series],
  );
  const tickInterval = preset === "30d" ? 4 : 0;

  if (buckets.length === 0) {
    return (
      <HeroEmptyState className="bg-surface px-4 py-12 text-sm text-muted">
        No sessions found.
      </HeroEmptyState>
    );
  }

  return (
    <div
      className="overflow-visible"
      data-bar-size={usageTrendBarSize}
      data-bucket-count={data.length}
      data-preset={preset}
      data-testid="usage-trend-chart-viewport"
    >
      <BarChart
        aria-label="Token usage trend by project chart"
        className="overflow-visible"
        data={data}
        height={200}
        margin={{ bottom: 0, left: 0, right: 8, top: 18 }}
        role="img"
        width="100%"
      >
        <BarChart.Grid vertical={false} />
        <BarChart.XAxis
          axisLine={false}
          dataKey="label"
          interval={tickInterval}
          minTickGap={8}
          tickLine={false}
          tickMargin={10}
        />
        <BarChart.YAxis domain={[0, "dataMax"]} hide />
        <BarChart.Tooltip
          allowEscapeViewBox={{ x: false, y: true }}
          content={<UsageTrendTooltipContent />}
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
            barSize={usageTrendBarSize}
            dataKey={item.dataKey}
            fill={item.color}
            isAnimationActive={false}
            name={item.project}
            stackId="tokens"
          />
        ))}
      </BarChart>
    </div>
  );
}

export function UsageTrendSection({
  days,
  projects,
}: {
  days: DailyTokensByProject[];
  projects: string[];
}) {
  const [preset, setPreset] = useState<UsageTrendPreset>("30d");
  const description =
    usageTrendPresetOptions.find((option) => option.id === preset)?.description ??
    usageTrendPresetOptions[0].description;

  return (
    <section className="min-w-0">
      <Card className="h-full overflow-visible">
        <Card.Content
          className={usageCardContentClass}
          data-testid="usage-trend-card-content"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Usage trend</h2>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
            <SharedElementTransition>
              <Segment
                aria-label="Usage trend period"
                selectedKey={preset}
                size="sm"
                onSelectionChange={(key) => {
                  const value = String(key);
                  setPreset(isUsageTrendPreset(value) ? value : "30d");
                }}
              >
                {usageTrendPresetOptions.map((option) => (
                  <Segment.Item key={option.id} id={option.id}>
                    {option.label}
                  </Segment.Item>
                ))}
              </Segment>
            </SharedElementTransition>
          </div>
          <UsageTrendChart days={days} preset={preset} projects={projects} />
          {projects.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
              {projects.slice(0, chartColorCount).map((project, index) => (
                <span key={project} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-sm"
                    style={{ backgroundColor: chartColor(index) }}
                  />
                  {project}
                </span>
              ))}
            </div>
          ) : null}
        </Card.Content>
      </Card>
    </section>
  );
}

type ModelMixRow = ModelDistribution & { color: string };

function modelMixRows(models: ModelDistribution[]): ModelMixRow[] {
  const sorted = [...models].sort(
    (left, right) => right.tokens - left.tokens || left.model.localeCompare(right.model),
  );
  const visible = sorted.length > 4 ? sorted.slice(0, 3) : sorted;
  const hidden = sorted.length > 4 ? sorted.slice(3) : [];
  const rows: ModelDistribution[] = [...visible];

  if (hidden.length > 0) {
    rows.push({
      model: "Other",
      costUsd: hidden.reduce((sum, model) => sum + model.costUsd, 0),
      tokens: hidden.reduce((sum, model) => sum + model.tokens, 0),
      costShare: hidden.reduce((sum, model) => sum + model.costShare, 0),
      tokenShare: hidden.reduce((sum, model) => sum + model.tokenShare, 0),
    });
  }

  return rows.map((model, index) => ({ ...model, color: chartColor(index) }));
}

export function ModelMixCard({ sessions }: { sessions: SessionSummary[] }) {
  const models = useMemo(() => modelMixRows(aggregateModelDistribution(sessions)), [sessions]);
  const totalTokens = models.reduce((sum, model) => sum + model.tokens, 0);

  return (
    <Card className="h-full">
      <Card.Content className={usageCardContentClass} data-testid="model-mix-card-content">
        <div>
          <h2 className="text-base font-semibold text-foreground">Model mix</h2>
          <p className="mt-1 text-sm text-muted">Share of total tokens</p>
        </div>
        {models.length === 0 ? (
          <div className="mt-4">
            <EmptyUsageState>No model distribution yet.</EmptyUsageState>
          </div>
        ) : (
          <div className="mt-4 grid items-center gap-3 md:grid-cols-[10rem_minmax(0,1fr)]">
            <div
              aria-label="Model token distribution"
              className="relative mx-auto size-40"
              role="img"
            >
              <PieChart height={160} width={160}>
                <Pie
                  cx="50%"
                  cy="50%"
                  data={models}
                  dataKey="tokens"
                  innerRadius={48}
                  isAnimationActive={false}
                  nameKey="model"
                  outerRadius={74}
                  paddingAngle={2}
                  stroke="var(--surface)"
                  strokeWidth={3}
                >
                  {models.map((model) => (
                    <Cell key={model.model} fill={model.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value) => [`${formatTokens(Number(value))} tokens`, "Usage"]}
                />
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-semibold text-foreground">
                  {formatTokens(totalTokens)}
                </span>
                <span className="text-xs text-muted">tokens</span>
              </div>
            </div>
            <div className="grid gap-2.5">
              {models.map((model) => (
                <div key={model.model} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: model.color }}
                      />
                      <span className="truncate text-sm font-medium text-foreground">
                        {model.model}
                      </span>
                    </div>
                    <p className="mt-1 pl-[1.125rem] text-xs text-muted">
                      {formatTokens(model.tokens)} · {formatCost(model.costUsd)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {formatPercent(model.tokenShare)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
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

export function TokenHeatmap({ days }: { days: DailyTokenUsage[] }) {
  const heatmap = useMemo(() => buildTrailingAnnualTokenHeatmap(days), [days]);

  if (!heatmap) {
    return (
      <HeroEmptyState className="bg-surface px-4 py-12 text-sm text-muted">
        No token usage yet.
      </HeroEmptyState>
    );
  }

  const activeDays = heatmap.days.filter((day) => day.totalTokens > 0).length;
  const peakDayTokens = Math.max(...heatmap.days.map((day) => day.totalTokens), 0);
  const maxTokens = peakDayTokens;

  return (
    <Card className="overflow-visible">
      <Card.Content
        className={usageCardContentClass}
        data-testid="token-heatmap-card-content"
      >
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">Token activity</h2>
          <p className="mt-1 text-sm text-muted">Daily total tokens over the last year</p>
        </div>
        <div
          className="grid items-start gap-5 xl:grid-cols-[max-content_minmax(7rem,1fr)]"
          data-testid="token-heatmap-layout"
        >
          <ScrollShadow
            className="min-w-0 max-w-full overflow-x-auto pb-1"
            hideScrollBar
            orientation="horizontal"
            size={32}
          >
            <div className="w-max" data-testid="token-heatmap-calendar">
              <div className="grid gap-2">
                <div
                  aria-hidden
                  className="grid gap-0.5 text-sm leading-none text-muted"
                  style={{
                    gridTemplateColumns: `repeat(${heatmap.weekCount}, 0.75rem)`,
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
                <div
                  className="grid gap-0.5"
                  data-day-count={heatmap.days.length}
                  data-testid="token-heatmap-grid"
                  data-year={heatmap.year}
                  style={{
                    gridTemplateColumns: `repeat(${heatmap.weekCount}, 0.75rem)`,
                  }}
                >
                  {heatmap.days.map((day) => {
                    const activityValue = day.totalTokens;
                    const level = heatLevel(activityValue, maxTokens);

                    return (
                      <div
                        key={day.date}
                        aria-label={`${formatDateLabel(day.date)} tokens ${day.totalTokens}`}
                        className="size-3 justify-self-center rounded-full"
                        data-activity-value={activityValue}
                        data-date={day.date}
                        data-level={level}
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
              </div>
            </div>
          </ScrollShadow>
          <div
            className="grid grid-cols-2 items-start gap-x-5 gap-y-4 border-t border-border pt-4 xl:grid-cols-1 xl:content-start xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"
            data-testid="token-heatmap-summary"
          >
            <div aria-label={`${activeDays} active days`}>
              <div className="text-xs text-muted">Active days</div>
              <div className="mt-1 tabular-nums text-xl font-semibold leading-none text-foreground">
                {activeDays}
              </div>
            </div>
            <div aria-label={`${formatTokens(peakDayTokens)} peak day`}>
              <div className="text-xs text-muted">Peak day</div>
              <div className="mt-1 tabular-nums text-xl font-semibold leading-none text-foreground">
                {formatTokens(peakDayTokens)}
              </div>
            </div>
            <div className="col-span-2 grid gap-1.5 text-xs text-muted xl:col-span-1">
              <div className="flex items-center justify-between">
                <span>Less</span>
                <span>More</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {[0, 1, 2, 3, 4].map((level) => (
                  <span
                    key={level}
                    aria-hidden
                    className="size-3 rounded-full"
                    style={{ backgroundColor: heatColor(level) }}
                  />
                ))}
              </div>
            </div>
          </div>
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
  const tokenDays = useMemo(() => aggregateDailyTokens(allSessions), [allSessions]);
  const tokenProjectDays = useMemo(
    () => aggregateDailyTokensByProject(allSessions),
    [allSessions],
  );
  const projects = useMemo(
    () => Array.from(new Set(allSessions.map((session) => session.project))).sort(),
    [allSessions],
  );

  useRefreshOnWindowFocus(sessions.refetch);

  return (
    <AppFrame>
      <article className="min-h-full px-6 py-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
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

              <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(24rem,0.9fr)]">
                <UsageTrendSection days={tokenProjectDays} projects={projects} />
                <ModelMixCard sessions={allSessions} />
              </div>

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
