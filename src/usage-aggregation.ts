import type { NamedCount, SessionSummary } from "./sessions";

export type ModelCost = {
  model: string;
  costUsd: number;
  tokens: number;
};

export type ModelDistribution = ModelCost & {
  costShare: number;
  tokenShare: number;
};

export type DailyProjectCost = {
  project: string;
  costUsd: number;
};

export type DailyCostByProject = {
  date: string;
  totalCostUsd: number;
  projects: DailyProjectCost[];
};

export type CostTrendGranularity = "day" | "week" | "month" | "year" | "cumulative";

export type CostByProjectBucket = {
  key: string;
  startDate: string;
  endDate: string;
  totalCostUsd: number;
  projects: DailyProjectCost[];
};

export type DailyTokenUsage = {
  date: string;
  totalTokens: number;
};

export type AnnualTokenUsageDay = DailyTokenUsage & {
  weekIndex: number;
  weekdayIndex: number;
};

export type AnnualTokenMonthLabel = {
  label: string;
  weekIndex: number;
};

export type AnnualTokenHeatmap = {
  year: number;
  startDate: string;
  endDate: string;
  days: AnnualTokenUsageDay[];
  weekCount: number;
  monthLabels: AnnualTokenMonthLabel[];
};

const shortMonthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toUtcDay(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function toUtcWeekStart(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const mondayOffset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - mondayOffset);
  return value.toISOString().slice(0, 10);
}

function utcDateFromDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function toUtcDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysInUtcYear(year: number) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return Math.round((end - start) / 86_400_000);
}

function utcDayOffset(start: Date, date: Date) {
  const startTime = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Math.floor((date.getTime() - startTime) / 86_400_000);
}

function latestTokenYear(days: DailyTokenUsage[]) {
  return days.reduce<number | undefined>((latestYear, day) => {
    const year = utcDateFromDay(day.date).getUTCFullYear();
    return latestYear === undefined ? year : Math.max(latestYear, year);
  }, undefined);
}

function latestTokenDate(days: DailyTokenUsage[]) {
  return days.reduce<string | undefined>((latestDate, day) => {
    return latestDate === undefined ? day.date : latestDate > day.date ? latestDate : day.date;
  }, undefined);
}

function costBucketKey(date: string, granularity: CostTrendGranularity) {
  if (granularity === "day") {
    return date;
  }
  if (granularity === "week") {
    return toUtcWeekStart(date);
  }
  if (granularity === "month") {
    return date.slice(0, 7);
  }
  if (granularity === "year") {
    return date.slice(0, 4);
  }
  return "cumulative";
}

function dayRange(sessions: SessionSummary[]) {
  if (sessions.length === 0) {
    return [];
  }

  const days = sessions.map((session) => toUtcDay(session.timestamp)).sort();
  const start = new Date(`${days[0]}T00:00:00.000Z`);
  const end = new Date(`${days[days.length - 1]}T00:00:00.000Z`);
  const range: string[] = [];

  for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
    range.push(cursor.toISOString().slice(0, 10));
  }

  return range;
}

export function aggregateDailyCostByProject(sessions: SessionSummary[]): DailyCostByProject[] {
  const totals = new Map<string, Map<string, number>>();

  for (const session of sessions) {
    const day = toUtcDay(session.timestamp);
    const projectTotals = totals.get(day) ?? new Map<string, number>();
    projectTotals.set(
      session.project,
      (projectTotals.get(session.project) ?? 0) + session.totalCostUsd,
    );
    totals.set(day, projectTotals);
  }

  return dayRange(sessions).map((date) => {
    const projects = Array.from(totals.get(date)?.entries() ?? [])
      .map(([project, costUsd]) => ({ project, costUsd }))
      .sort((left, right) => right.costUsd - left.costUsd || left.project.localeCompare(right.project));

    return {
      date,
      totalCostUsd: projects.reduce((sum, project) => sum + project.costUsd, 0),
      projects,
    };
  });
}

export function bucketCostByProject(
  days: DailyCostByProject[],
  granularity: CostTrendGranularity,
): CostByProjectBucket[] {
  const buckets = new Map<string, { startDate: string; endDate: string; projects: Map<string, number> }>();

  for (const day of days) {
    const key = costBucketKey(day.date, granularity);
    const bucket = buckets.get(key) ?? {
      startDate: day.date,
      endDate: day.date,
      projects: new Map<string, number>(),
    };

    bucket.startDate = bucket.startDate < day.date ? bucket.startDate : day.date;
    bucket.endDate = bucket.endDate > day.date ? bucket.endDate : day.date;

    for (const project of day.projects) {
      bucket.projects.set(
        project.project,
        (bucket.projects.get(project.project) ?? 0) + project.costUsd,
      );
    }

    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => {
    const projects = Array.from(bucket.projects.entries())
      .map(([project, costUsd]) => ({ project, costUsd }))
      .sort((left, right) => right.costUsd - left.costUsd || left.project.localeCompare(right.project));

    return {
      key,
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      totalCostUsd: projects.reduce((sum, project) => sum + project.costUsd, 0),
      projects,
    };
  });
}

export function aggregateDailyTokens(sessions: SessionSummary[]): DailyTokenUsage[] {
  const totals = new Map<string, number>();

  for (const session of sessions) {
    const day = toUtcDay(session.timestamp);
    totals.set(day, (totals.get(day) ?? 0) + session.totalTokens);
  }

  return dayRange(sessions).map((date) => ({
    date,
    totalTokens: totals.get(date) ?? 0,
  }));
}

function buildTokenHeatmapForRange(
  days: DailyTokenUsage[],
  start: Date,
  end: Date,
): AnnualTokenHeatmap {
  const totals = new Map<string, number>();
  const startDate = toUtcDateOnly(start);
  const endDate = toUtcDateOnly(end);

  for (const day of days) {
    if (day.date < startDate || day.date > endDate) {
      continue;
    }
    totals.set(day.date, (totals.get(day.date) ?? 0) + day.totalTokens);
  }

  const firstWeekday = start.getUTCDay();
  const dayCount = utcDayOffset(start, end) + 1;
  const weekCount = Math.ceil((dayCount + firstWeekday) / 7);
  const heatmapDays: AnnualTokenUsageDay[] = [];

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const date = addUtcDays(start, dayIndex);
    const dateKey = toUtcDateOnly(date);

    heatmapDays.push({
      date: dateKey,
      totalTokens: totals.get(dateKey) ?? 0,
      weekdayIndex: date.getUTCDay(),
      weekIndex: Math.floor((dayIndex + firstWeekday) / 7),
    });
  }

  const monthLabels: AnnualTokenMonthLabel[] = [];
  for (
    let month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    month <= end;
    month = addUtcMonths(month, 1)
  ) {
    monthLabels.push({
      label: shortMonthLabels[month.getUTCMonth()],
      weekIndex: Math.floor((utcDayOffset(start, month) + firstWeekday) / 7),
    });
  }

  return {
    year: end.getUTCFullYear(),
    startDate,
    endDate,
    days: heatmapDays,
    weekCount,
    monthLabels,
  };
}

export function buildAnnualTokenHeatmap(
  days: DailyTokenUsage[],
  year = latestTokenYear(days),
): AnnualTokenHeatmap | null {
  if (year === undefined) {
    return null;
  }

  const start = new Date(Date.UTC(year, 0, 1));
  const end = addUtcDays(start, daysInUtcYear(year) - 1);

  return buildTokenHeatmapForRange(days, start, end);
}

export function buildTrailingAnnualTokenHeatmap(
  days: DailyTokenUsage[],
  latestDate = latestTokenDate(days),
): AnnualTokenHeatmap | null {
  if (latestDate === undefined) {
    return null;
  }

  const latest = utcDateFromDay(latestDate);
  const start = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() - 11, 1));
  const end = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 0));

  return buildTokenHeatmapForRange(days, start, end);
}

export function aggregateCostByModel(sessions: SessionSummary[]): ModelCost[] {
  const totals = new Map<string, { costUsd: number; tokens: number }>();

  for (const session of sessions) {
    for (const model of session.modelBreakdown) {
      const current = totals.get(model.model) ?? { costUsd: 0, tokens: 0 };
      current.costUsd += model.costUsd;
      current.tokens += model.tokens;
      totals.set(model.model, current);
    }
  }

  return Array.from(totals.entries())
    .map(([model, usage]) => ({ model, costUsd: usage.costUsd, tokens: usage.tokens }))
    .sort((left, right) => right.costUsd - left.costUsd || left.model.localeCompare(right.model));
}

export function aggregateModelDistribution(sessions: SessionSummary[]): ModelDistribution[] {
  const models = aggregateCostByModel(sessions);
  const totalCostUsd = models.reduce((sum, model) => sum + model.costUsd, 0);
  const totalTokens = models.reduce((sum, model) => sum + model.tokens, 0);

  return models.map((model) => ({
    ...model,
    costShare: totalCostUsd === 0 ? 0 : model.costUsd / totalCostUsd,
    tokenShare: totalTokens === 0 ? 0 : model.tokens / totalTokens,
  }));
}

function aggregateNamedCounts(
  sessions: SessionSummary[],
  selectCounts: (session: SessionSummary) => NamedCount[],
  limit: number,
): NamedCount[] {
  if (limit <= 0) {
    return [];
  }

  const totals = new Map<string, number>();
  for (const session of sessions) {
    for (const item of selectCounts(session)) {
      totals.set(item.name, (totals.get(item.name) ?? 0) + item.count);
    }
  }

  return Array.from(totals.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

export function aggregateToolCounts(sessions: SessionSummary[], limit = 8): NamedCount[] {
  return aggregateNamedCounts(sessions, (session) => session.toolCounts, limit);
}

export function aggregateSkillCounts(sessions: SessionSummary[], limit = 8): NamedCount[] {
  return aggregateNamedCounts(sessions, (session) => session.skillCounts, limit);
}
