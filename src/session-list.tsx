import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

type SessionSummary = {
  id: string;
  timestamp: string;
  project: string;
  title: Title;
  totalCostUsd: number;
  totalTokens: number;
  primaryModel?: string;
};

type Title =
  | { kind: "command"; name: string; args: string }
  | { kind: "skill"; name: string }
  | { kind: "text"; sentence: string }
  | { kind: "raw"; text: string };

function relativeTime(value: string) {
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

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCost(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatTokens(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

async function listSessions() {
  return invoke<SessionSummary[]>("list_sessions");
}

function SessionTitle({ title }: { title: Title }) {
  if (title.kind === "command") {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="inline-flex w-fit max-w-full items-center gap-1 rounded-md border border-border bg-surface-muted px-2 py-1 text-sm font-medium text-foreground">
          <span aria-hidden="true">⚡</span>
          <span className="truncate">{title.name}</span>
        </span>
        {title.args ? <span className="truncate text-xs text-muted">{title.args}</span> : null}
      </div>
    );
  }

  if (title.kind === "skill") {
    return (
      <span className="inline-flex w-fit max-w-full items-center gap-1 rounded-md border border-border bg-surface-muted px-2 py-1 text-sm font-medium text-foreground">
        <span aria-hidden="true">🧩</span>
        <span className="truncate">{title.name}</span>
      </span>
    );
  }

  if (title.kind === "text") {
    return <span className="truncate text-sm text-foreground">{title.sentence}</span>;
  }

  return (
    <span className="truncate text-sm text-muted">
      {title.text.length > 0 ? title.text : "Untitled session"}
    </span>
  );
}

export function SessionListPage() {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
  });
  const { refetch } = sessions;
  const sessionRows = sessions.data ?? [];

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          void refetch();
        }
      })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }

        unlisten = nextUnlisten;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refetch]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-6">
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">Pig</h1>
            <p className="mt-1 text-sm text-muted">Recent Pi sessions</p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-foreground shadow-sm transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => sessions.refetch()}
            disabled={sessions.isFetching}
            title="Refresh sessions"
            aria-label="Refresh sessions"
          >
            <RefreshCw className={`size-4 ${sessions.isFetching ? "animate-spin" : ""}`} />
          </button>
        </header>

        <section className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
          <div className="grid min-w-[54rem] grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.5fr)_minmax(5rem,0.55fr)_minmax(0,0.85fr)_minmax(5.5rem,0.65fr)_minmax(0,0.7fr)] gap-4 border-b border-border bg-surface-muted px-4 py-2 text-xs font-medium uppercase text-muted">
            <span>Cost</span>
            <span>Title</span>
            <span>Tokens</span>
            <span>Model</span>
            <span>Time</span>
            <span>Project</span>
          </div>

          {sessions.isLoading ? (
            <div className="px-4 py-12 text-sm text-muted">Loading sessions...</div>
          ) : sessions.isError ? (
            <div className="px-4 py-12 text-sm text-danger">
              Could not read the Pi agent directory.
            </div>
          ) : sessionRows.length === 0 ? (
            <div className="px-4 py-12 text-sm text-muted">No sessions found.</div>
          ) : (
            <ol>
              {sessionRows.map((session) => (
                <li
                  key={session.id}
                  className="border-b border-border last:border-b-0"
                >
                  <Link
                    to="/sessions/$sessionId"
                    params={{ sessionId: session.id }}
                    className="grid min-h-16 min-w-[54rem] grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.5fr)_minmax(5rem,0.55fr)_minmax(0,0.85fr)_minmax(5.5rem,0.65fr)_minmax(0,0.7fr)] items-center gap-4 px-4 py-3 transition hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-inset focus:ring-foreground/20"
                  >
                    <div className="min-w-0">
                      <div className="text-lg font-semibold leading-6 text-foreground">
                        {formatCost(session.totalCostUsd)}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium uppercase text-muted">
                        API list price
                      </div>
                    </div>
                    <div className="min-w-0">
                      <SessionTitle title={session.title} />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {formatTokens(session.totalTokens)}
                    </span>
                    <span className="min-w-0 truncate text-sm text-muted">
                      {session.primaryModel ?? "Unknown model"}
                    </span>
                    <time
                      dateTime={session.timestamp}
                      title={formatTimestamp(session.timestamp)}
                      className="text-sm font-medium text-foreground"
                    >
                      {relativeTime(session.timestamp)}
                    </time>
                    <span className="min-w-0 truncate text-sm text-muted">{session.project}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
