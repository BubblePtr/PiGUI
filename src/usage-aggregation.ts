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

export type DailyTokenUsage = {
  date: string;
  totalTokens: number;
};

function toUtcDay(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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
