import { invoke } from "@/shared/runtime";
import type { PersistedSessionProjection } from "@pigui/backend";
import type { SessionChanges, SessionSummary } from "@pigui/core";

export type { SessionSummary, ModelUsage, NamedCount, Title } from "@pigui/core";
export type { PersistedSessionProjection } from "@pigui/backend";

export async function listSessions() {
  return invoke<SessionSummary[]>("list_sessions");
}

export async function listSessionProjections() {
  return invoke<PersistedSessionProjection[]>("list_session_projections");
}

export async function archiveSessionProjection(sessionId: string) {
  return invoke<PersistedSessionProjection>("archive_session", { sessionId });
}

export async function getSessionChanges(sessionId: string) {
  return invoke<SessionChanges>("get_session_changes", { sessionId });
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function formatCost(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatTokens(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function relativeTime(value: string) {
  const then = new Date(value).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, divisor] of units) {
    if (seconds >= divisor) {
      return formatter.format(-Math.floor(seconds / divisor), unit);
    }
  }
  return formatter.format(-seconds, "second");
}
