import {
  SessionManager,
  createAgentSession,
  type SessionInfo,
} from "@earendil-works/pi-coding-agent";
import {
  measureIdleAgentSessionMemory,
  selectIdleMemorySessionSamples,
  type IdleMemorySessionInfo,
} from "../src/session-memory-measurement";

const mib = 1024 * 1024;

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatMib(bytes: number) {
  return Number((bytes / mib).toFixed(2));
}

function readRssBytes() {
  return process.memoryUsage().rss;
}

function forceGc() {
  const maybeBun = globalThis as typeof globalThis & {
    Bun?: { gc?: (force?: boolean) => void };
    gc?: () => void;
  };

  maybeBun.gc?.();
  maybeBun.Bun?.gc?.(true);
}

async function settle() {
  forceGc();
  await new Promise((resolve) => {
    setTimeout(resolve, numberFromEnv("PIGUI_IDLE_MEMORY_SETTLE_MS", 50));
  });
  forceGc();
}

function toIdleMemorySessionInfo(session: SessionInfo): IdleMemorySessionInfo {
  return {
    id: session.id,
    path: session.path,
    cwd: session.cwd,
    modified: session.modified,
    messageCount: session.messageCount,
  };
}

async function openAgentSession(info: IdleMemorySessionInfo) {
  const sessionManager = SessionManager.open(info.path);
  const { session } = await createAgentSession({
    cwd: sessionManager.getCwd() || info.cwd || process.cwd(),
    sessionManager,
  });

  return {
    dispose() {
      session.dispose();
    },
  };
}

const sampleSize = numberFromEnv("PIGUI_IDLE_MEMORY_SAMPLE_SIZE", 50);
const thresholdBytes = numberFromEnv("PIGUI_IDLE_MEMORY_THRESHOLD_MB", 20) * mib;
const minExpectedSamples = numberFromEnv("PIGUI_IDLE_MEMORY_MIN_SAMPLES", 20);
const listedSessions = (await SessionManager.listAll()).map(toIdleMemorySessionInfo);
const warmupSession = selectIdleMemorySessionSamples(listedSessions, {
  sampleSize: 1,
})[0];

if (warmupSession) {
  const warmupHandle = await openAgentSession(warmupSession);

  await settle();
  await warmupHandle.dispose();
  await settle();
}

const result = await measureIdleAgentSessionMemory({
  sampleSize,
  thresholdBytes,
  readRssBytes,
  settle,
  async listSessions() {
    return listedSessions;
  },
  openAgentSession,
});

const { summary } = result;
const report = {
  ok: summary.openedCount >= minExpectedSamples,
  sampleSizeRequested: sampleSize,
  minExpectedSamples,
  selectedCount: result.selectedSessions.length,
  openedCount: summary.openedCount,
  warmupSession: warmupSession
    ? {
        id: warmupSession.id,
        path: warmupSession.path,
      }
    : null,
  thresholdMB: formatMib(summary.thresholdBytes),
  baselineRssMB: formatMib(summary.baselineRssBytes),
  finalRssMB: formatMib(summary.finalRssBytes),
  totalDeltaMB: formatMib(summary.totalDeltaBytes),
  averageDeltaMB: formatMib(summary.averageDeltaBytes),
  maxStepDeltaMB: formatMib(summary.maxStepDeltaBytes),
  shouldAdvanceEviction: summary.shouldAdvanceEviction,
  selectedSessions: result.selectedSessions.map((session) => ({
    id: session.id,
    path: session.path,
    cwd: session.cwd,
    modified: session.modified.toISOString(),
    messageCount: session.messageCount,
  })),
  openedSessions: summary.openedSessions.map((session) => ({
    path: session.path,
    rssMB: formatMib(session.rssBytes),
    stepDeltaMB: formatMib(session.stepDeltaBytes),
  })),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.ok ? 0 : 1);
