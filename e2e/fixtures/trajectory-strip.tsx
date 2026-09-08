import { createRoot } from "react-dom/client";
import { buildTrajectoryTurns } from "../../apps/desktop/src/entities/session/trajectory-model";
import { PiTrajectoryStrip } from "../../apps/desktop/src/shared/ui/pi-trajectory-strip";
import "../../apps/desktop/src/app/styles.css";

const params = new URLSearchParams(location.search);
const turns = buildTrajectoryTurns(
  Array.from({ length: Number(params.get("count")) }, (_, index) => ({
    kind: "message" as const,
    role: index % 2 ? "assistant" as const : "user" as const,
    modelDurationMs: index % 3 ? 500 : 300_000,
    parts: [{ partType: "text" as const, text: `Step ${index}`, payload: {} }],
  })),
);

createRoot(document.getElementById("root")!).render(
  <PiTrajectoryStrip
    turns={turns}
    widthMode={params.get("mode") === "duration" ? "duration" : "steps"}
    onSelect={(_, stepId) => { document.body.dataset.selected = stepId; }}
    onWidthModeChange={() => {}}
  />,
);
