import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  PiTraceLedger,
  type TraceLedgerEntry,
  type TraceLedgerGroup,
} from "@/shared/ui/pi-trace-ledger";

const toolOk: TraceLedgerEntry = {
  id: "e1",
  kind: "tool",
  name: "bash",
  target: "git diff --stat",
  durationMs: 340,
  status: "ok",
  detail: (
    <>
      <pre data-label="args">{'{"command":"git diff --stat"}'}</pre>
      <pre data-label="output">3 files changed</pre>
    </>
  ),
};

const toolFailed: TraceLedgerEntry = {
  id: "e2",
  kind: "tool",
  name: "edit",
  target: "src/utils/formatDate.ts",
  durationMs: 12400,
  status: "error",
  detail: <pre data-label="output">patch failed to apply</pre>,
};

const thinking: TraceLedgerEntry = {
  id: "e3",
  kind: "think",
  target: "Root cause confirmed, fixing.",
  detail: <pre data-label="thinking">Root cause confirmed: toolCallId is never remapped on fork.</pre>,
};

const bareText: TraceLedgerEntry = {
  id: "e4",
  kind: "text",
  target: "Done — three files updated.",
};

const running: TraceLedgerEntry = {
  id: "e5",
  kind: "tool",
  name: "grep",
  target: "remapToolCallId",
  status: "running",
};

const groups: TraceLedgerGroup[] = [
  {
    id: "g1",
    label: "Assistant",
    timestamp: "2026-03-22T14:41:42.000Z",
    meta: "$0.3301 · 43.8K tokens",
    entries: [thinking, toolOk, toolFailed],
  },
  {
    id: "g2",
    label: "Assistant",
    entries: [bareText, running],
  },
];

describe("PiTraceLedger", () => {
  it("renders groups as dividers with label and meta, entries as ledger rows", () => {
    const { container } = render(<PiTraceLedger groups={groups} />);

    expect(container.querySelector('[data-slot="trace-ledger"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="trace-ledger-group"]')).toHaveLength(2);
    expect(screen.getAllByText("Assistant")).toHaveLength(2);
    expect(screen.getByText("$0.3301 · 43.8K tokens")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="trace-ledger-row"]')).toHaveLength(5);
  });

  it("marks rows with kind and status, and shows the matching glyph", () => {
    const { container } = render(<PiTraceLedger groups={groups} />);

    const rows = container.querySelectorAll('[data-slot="trace-ledger-row"]');
    expect(rows[1]).toHaveAttribute("data-kind", "tool");
    expect(rows[1]).toHaveAttribute("data-status", "ok");
    expect(rows[2]).toHaveAttribute("data-status", "error");
    expect(rows[4]).toHaveAttribute("data-status", "running");

    expect(rows[1].querySelector('[data-slot="trace-ledger-glyph"]')).toHaveTextContent("✓");
    expect(rows[2].querySelector('[data-slot="trace-ledger-glyph"]')).toHaveTextContent("✕");
    expect(rows[4].querySelector('[data-slot="trace-ledger-glyph"]')).toHaveTextContent("●");
  });

  it("shows kind, name, target, and right-aligned formatted duration per row", () => {
    render(<PiTraceLedger groups={groups} />);

    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("git diff --stat")).toBeInTheDocument();
    expect(screen.getByText("340ms")).toBeInTheDocument();
    expect(screen.getByText("12.4s")).toBeInTheDocument();
    expect(screen.getByText("think")).toBeInTheDocument();
    expect(screen.getByText("Root cause confirmed, fixing.")).toBeInTheDocument();
  });

  it("keeps detail unmounted until the row is expanded, then mounts it inline", async () => {
    const user = userEvent.setup();
    render(<PiTraceLedger groups={groups} />);

    expect(screen.queryByText("3 files changed")).not.toBeInTheDocument();

    const row = screen.getByRole("button", { name: /bash/ });
    expect(row).toHaveAttribute("aria-expanded", "false");

    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("3 files changed")).toBeInTheDocument();

    await user.click(row);
    expect(screen.queryByText("3 files changed")).not.toBeInTheDocument();
  });

  it("renders detail-less rows as static (no disclosure affordance)", () => {
    render(<PiTraceLedger groups={groups} />);

    const staticRow = screen.getByText("Done — three files updated.").closest(
      '[data-slot="trace-ledger-row"]',
    );
    expect(staticRow?.querySelector("button")).not.toBeInTheDocument();
  });

  it("exposes Group standalone so pages can virtualize by group", () => {
    const { container } = render(
      <PiTraceLedger>
        <PiTraceLedger.Group group={groups[0]} />
      </PiTraceLedger>,
    );

    expect(container.querySelectorAll('[data-slot="trace-ledger-group"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="trace-ledger-row"]')).toHaveLength(3);
  });

  it("renders an empty state label when there are no groups", () => {
    render(<PiTraceLedger emptyLabel="No timeline entries found." groups={[]} />);

    expect(screen.getByText("No timeline entries found.")).toBeInTheDocument();
  });
});
