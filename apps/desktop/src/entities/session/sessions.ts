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

export async function renameSessionProjection(sessionId: string, title: string) {
  return invoke<PersistedSessionProjection>("rename_session", {
    sessionId,
    title,
  });
}

export async function deleteSessionProjection(sessionId: string) {
  return invoke<PersistedSessionProjection>("delete_session", { sessionId });
}

export async function getSessionChanges(sessionId: string) {
  return invoke<SessionChanges>("get_session_changes", { sessionId });
}

export async function checkoutSessionBranch(sessionId: string, branch: string) {
  return invoke<SessionChanges>("checkout_session_branch", { sessionId, branch });
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

/** Compact local time for sidebar session chips (never raw UTC slice). */
export function formatSessionListTime(
  value: string,
  now: Date = new Date(),
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  // Calendar days, not elapsed 24h buckets: yesterday is always 1d ago even
  // if the wait was 8 hours, and DST cannot stretch or shrink the count.
  const startOfThen = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const startOfNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((startOfNow - startOfThen) / 86_400_000);

  return `${Math.max(1, days)}d ago`;
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
