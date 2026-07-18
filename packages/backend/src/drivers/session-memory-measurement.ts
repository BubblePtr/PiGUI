export type IdleMemorySessionInfo = {
  id: string;
  path: string;
  cwd: string;
  modified: Date;
  messageCount: number;
};

export type IdleMemoryMeasurementOptions = {
  sampleSize?: number;
};

export type OpenedIdleSessionMemorySample = {
  path: string;
  rssBytes: number;
};

export type IdleAgentSessionMemorySummary = {
  openedCount: number;
  baselineRssBytes: number;
  finalRssBytes: number;
  totalDeltaBytes: number;
  averageDeltaBytes: number;
  maxStepDeltaBytes: number;
  thresholdBytes: number;
  shouldAdvanceEviction: boolean;
  openedSessions: Array<OpenedIdleSessionMemorySample & { stepDeltaBytes: number }>;
};

export type IdleAgentSessionHandle = {
  dispose?: () => void | Promise<void>;
};

export type MeasureIdleAgentSessionMemoryInput = {
  listSessions: () => Promise<IdleMemorySessionInfo[]>;
  openAgentSession: (session: IdleMemorySessionInfo) => Promise<IdleAgentSessionHandle>;
  readRssBytes: () => number;
  settle?: () => Promise<void>;
  sampleSize?: number;
  thresholdBytes?: number;
};

export type MeasureIdleAgentSessionMemoryResult = {
  selectedSessions: IdleMemorySessionInfo[];
  summary: IdleAgentSessionMemorySummary;
};

const defaultSampleSize = 50;
const defaultThresholdBytes = 20 * 1024 * 1024;

export function selectIdleMemorySessionSamples(
  sessions: IdleMemorySessionInfo[],
  options: IdleMemoryMeasurementOptions = {},
) {
  const sampleSize = options.sampleSize ?? defaultSampleSize;

  return sessions
    .filter((session) => session.messageCount > 0)
    .sort((left, right) => right.modified.getTime() - left.modified.getTime())
    .slice(0, sampleSize);
}

export function summarizeIdleAgentSessionMemory(input: {
  baselineRssBytes: number;
  openedSessions: OpenedIdleSessionMemorySample[];
  thresholdBytes?: number;
}): IdleAgentSessionMemorySummary {
  const thresholdBytes = input.thresholdBytes ?? defaultThresholdBytes;
  let previousRssBytes = input.baselineRssBytes;
  let maxStepDeltaBytes = 0;
  const openedSessions = input.openedSessions.map((sample) => {
    const stepDeltaBytes = sample.rssBytes - previousRssBytes;

    previousRssBytes = sample.rssBytes;
    maxStepDeltaBytes = Math.max(maxStepDeltaBytes, stepDeltaBytes);

    return {
      ...sample,
      stepDeltaBytes,
    };
  });
  const finalRssBytes =
    input.openedSessions[input.openedSessions.length - 1]?.rssBytes ??
    input.baselineRssBytes;
  const totalDeltaBytes = finalRssBytes - input.baselineRssBytes;
  const openedCount = input.openedSessions.length;
  const averageDeltaBytes = openedCount > 0 ? totalDeltaBytes / openedCount : 0;

  return {
    openedCount,
    baselineRssBytes: input.baselineRssBytes,
    finalRssBytes,
    totalDeltaBytes,
    averageDeltaBytes,
    maxStepDeltaBytes,
    thresholdBytes,
    shouldAdvanceEviction:
      averageDeltaBytes > thresholdBytes || maxStepDeltaBytes > thresholdBytes,
    openedSessions,
  };
}

async function disposeOpenedSessions(handles: IdleAgentSessionHandle[]) {
  for (const handle of handles) {
    await handle.dispose?.();
  }
}

export async function measureIdleAgentSessionMemory(
  input: MeasureIdleAgentSessionMemoryInput,
): Promise<MeasureIdleAgentSessionMemoryResult> {
  const selectedSessions = selectIdleMemorySessionSamples(await input.listSessions(), {
    sampleSize: input.sampleSize,
  });
  const openedHandles: IdleAgentSessionHandle[] = [];
  const openedSamples: OpenedIdleSessionMemorySample[] = [];
  const baselineRssBytes = input.readRssBytes();
  const thresholdBytes = input.thresholdBytes ?? defaultThresholdBytes;
  const settle = input.settle ?? (async () => {});

  try {
    for (const session of selectedSessions) {
      const handle = await input.openAgentSession(session);

      openedHandles.push(handle);
      await settle();
      openedSamples.push({
        path: session.path,
        rssBytes: input.readRssBytes(),
      });
    }

    return {
      selectedSessions,
      summary: summarizeIdleAgentSessionMemory({
        baselineRssBytes,
        openedSessions: openedSamples,
        thresholdBytes,
      }),
    };
  } finally {
    await disposeOpenedSessions(openedHandles);
  }
}
