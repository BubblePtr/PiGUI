import { createRoot } from "react-dom/client";
import type { SessionDetail, SessionTurn } from "@pace/core";
import { SessionDetailView } from "../../apps/desktop/src/pages/session-detail";
import "../../apps/desktop/src/app/styles.css";

const turns: SessionTurn[] = Array.from({ length: 3 }, (_, runIndex) => [
  {
    kind: "message" as const,
    role: "user" as const,
    parts: [{ partType: "text" as const, text: `Prompt ${runIndex + 1}`, payload: {} }],
  },
  ...Array.from({ length: 12 }, (_, stepIndex) => ({
    kind: "message" as const,
    role: "assistant" as const,
    parts: [{
      partType: "text" as const,
      text: `Run ${runIndex + 1} step ${stepIndex + 1}`,
      payload: {},
    }],
  })),
]).flat();

const session: SessionDetail = {
  id: "trajectory-ledger-fixture",
  project: "Ledger layout",
  timestamp: "2026-09-10T12:00:00.000Z",
  totalCostUsd: 0,
  totalTokens: 0,
  primaryModel: "fixture-model",
  turnCount: turns.length,
  durationSeconds: 0,
  turns,
};

createRoot(document.getElementById("root")!).render(
  <SessionDetailView session={session} sessionId={session.id} />,
);
