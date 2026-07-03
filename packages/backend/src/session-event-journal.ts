// Session Event Journal — the persistence half of replay (ADR-0020, slice 6).
// The Gateway appends boundary envelopes here; snapshots read them back so a
// reattaching client rebuilds its runtime model statically. Files are plain
// JSONL so history survives a process restart and stays auditable.

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeGatewayEventEnvelope } from "@pigui/core";

// PiGUI's own data lives outside ~/.pi — that directory is Pi's session truth
// and PiGUI only observes it.
export function resolveDataDir(env: NodeJS.ProcessEnv = process.env) {
  if (env.PIGUI_DATA_DIR) {
    return env.PIGUI_DATA_DIR;
  }

  return join(homedir(), ".pigui");
}

export type SessionEventJournal = {
  append(envelope: RuntimeGatewayEventEnvelope): void;
  read(piSessionId: string): Promise<RuntimeGatewayEventEnvelope[]>;
};

export type FileSessionEventJournalOptions = {
  dataDir: string;
};

function cloneEnvelope(envelope: RuntimeGatewayEventEnvelope): RuntimeGatewayEventEnvelope {
  return { ...envelope, payload: { ...envelope.payload } };
}

export function createInMemorySessionEventJournal(): SessionEventJournal {
  const entries = new Map<string, RuntimeGatewayEventEnvelope[]>();

  return {
    append(envelope) {
      const session = entries.get(envelope.piSessionId) ?? [];

      session.push(cloneEnvelope(envelope));
      entries.set(envelope.piSessionId, session);
    },

    async read(piSessionId) {
      return (entries.get(piSessionId) ?? []).map(cloneEnvelope);
    },
  };
}

// URI-encoding keeps path separators out of the file name, so a hostile
// session id cannot traverse outside the sessions directory.
function journalFileName(piSessionId: string) {
  return `${encodeURIComponent(piSessionId)}.jsonl`;
}

function parseJournalLines(jsonl: string): RuntimeGatewayEventEnvelope[] {
  const envelopes: RuntimeGatewayEventEnvelope[] = [];

  for (const line of jsonl.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    try {
      envelopes.push(JSON.parse(line) as RuntimeGatewayEventEnvelope);
    } catch {
      // A torn trailing line (crash mid-append) must not poison the rest of
      // the journal.
      continue;
    }
  }

  return envelopes;
}

export function createFileSessionEventJournal(
  options: FileSessionEventJournalOptions,
): SessionEventJournal {
  const sessionsDir = join(options.dataDir, "sessions");
  const buffered = new Map<string, RuntimeGatewayEventEnvelope[]>();
  // Appends are serialized on one chain; a failed write is reported but must
  // not break the chain or the in-memory buffer.
  let pendingWrites: Promise<void> = Promise.resolve();

  const bufferFor = (piSessionId: string) => {
    const session = buffered.get(piSessionId) ?? [];

    buffered.set(piSessionId, session);

    return session;
  };

  return {
    append(envelope) {
      bufferFor(envelope.piSessionId).push(cloneEnvelope(envelope));

      const line = `${JSON.stringify(envelope)}\n`;
      const path = join(sessionsDir, journalFileName(envelope.piSessionId));

      pendingWrites = pendingWrites
        .then(async () => {
          await mkdir(sessionsDir, { recursive: true });
          await appendFile(path, line, "utf8");
        })
        .catch((error) => {
          console.error(
            `PiGUI session event journal failed to append to "${path}":`,
            error,
          );
        });
    },

    async read(piSessionId) {
      await pendingWrites;

      const session = buffered.get(piSessionId);

      if (session) {
        return session.map(cloneEnvelope);
      }

      // Not seen in this process: a prior process may have journaled it.
      try {
        const restored = parseJournalLines(
          await readFile(join(sessionsDir, journalFileName(piSessionId)), "utf8"),
        );

        buffered.set(piSessionId, restored);

        return restored.map(cloneEnvelope);
      } catch {
        return [];
      }
    },
  };
}
