import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeLargeSessionDetail, largeSessionDetailApproxBytes } from "@/entities/session/session-detail.fixtures";
import { SessionDetailView, SessionTimeline } from "@/pages/session-detail";
import type { SessionTurn } from "@/pages/session-detail";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    Link: ({
      children,
      className,
      to,
    }: {
      children: ReactNode;
      className?: string;
      to: string;
    }) => (
      <a className={className} href={to}>
        {children}
      </a>
    ),
    useParams: () => ({ sessionId: "session-a" }),
  };
});

describe("SessionTimeline", () => {
  it("renders the large fixture as virtualized ledger groups with heavy payloads unmounted", () => {
    const session = makeLargeSessionDetail();
    const { container } = render(<SessionTimeline turns={session.turns} />);

    expect(largeSessionDetailApproxBytes).toBeGreaterThan(8 * 1024 * 1024);
    expect(container.querySelector('[data-slot="trace-ledger"]')).toBeInTheDocument();
    expect(screen.getAllByText("Assistant").length).toBeGreaterThan(0);
    expect(screen.getByText("Plan fixture turn 0")).toBeInTheDocument();
    expect(screen.getAllByText(/\$0\.0/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Hidden thinking line 0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/huge output sentinel 0/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-index]").length).toBeLessThan(session.turns.length);
  });

  it("pairs a toolCall with its result into one ledger row carrying status and duration", () => {
    const turns: SessionTurn[] = [
      {
        kind: "message",
        role: "assistant",
        timestamp: "2026-03-22T14:41:42.000Z",
        model: "gpt-5",
        parts: [
          {
            partType: "toolCall",
            name: "bash",
            payload: {
              type: "toolCall",
              id: "call_1",
              name: "bash",
              arguments: { command: "git diff --stat" },
            },
          },
          {
            partType: "toolResult",
            name: "bash",
            text: "3 files changed",
            isError: false,
            durationMs: 340,
            payload: { toolCallId: "call_1" },
          },
          {
            partType: "toolCall",
            name: "edit",
            payload: {
              type: "toolCall",
              id: "call_2",
              name: "edit",
              arguments: { path: "src/utils/formatDate.ts" },
            },
          },
          {
            partType: "toolResult",
            name: "edit",
            text: "patch failed to apply",
            isError: true,
            durationMs: 12400,
            payload: { toolCallId: "call_2" },
          },
        ],
      },
    ];

    const { container } = render(<SessionTimeline turns={turns} />);

    const rows = container.querySelectorAll('[data-slot="trace-ledger-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-kind", "tool");
    expect(rows[0]).toHaveAttribute("data-status", "ok");
    expect(rows[1]).toHaveAttribute("data-status", "error");
    expect(screen.getByText("git diff --stat")).toBeInTheDocument();
    expect(screen.getByText("340ms")).toBeInTheDocument();
    expect(screen.getByText("12.4s")).toBeInTheDocument();
  });

  it("expands think and tool rows inline to their full payloads", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail();
    render(<SessionTimeline turns={session.turns} />);

    await user.click(screen.getByRole("button", { name: /Plan fixture turn 0/ }));
    expect(screen.getByText(/Hidden thinking line 0/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /read_file/ })[0]);
    expect(screen.getByText(/huge output sentinel 0/)).toBeInTheDocument();
    expect(screen.getByText(/cat \/tmp\/fixture-0\.txt/)).toBeInTheDocument();
  });

  it("renders image parts as inline thumbnails in the expanded detail", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail();
    render(<SessionTimeline turns={session.turns} />);

    expect(screen.queryByRole("img", { name: "Fixture thumbnail 0" })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /image/ })[0]);
    expect(screen.getByRole("img", { name: "Fixture thumbnail 0" })).toBeInTheDocument();
  });

  it("renders Pi jsonl image parts that use data and mimeType", async () => {
    const user = userEvent.setup();
    const turns: SessionTurn[] = [
      {
        kind: "message",
        role: "assistant",
        timestamp: "2026-03-22T14:41:42.000Z",
        parts: [
          {
            partType: "image",
            payload: {
              mimeType: "image/png",
              data: "abc",
              name: "shot.png",
            },
          },
        ],
      },
    ];

    render(<SessionTimeline turns={turns} />);

    await user.click(screen.getByRole("button", { name: /image/ }));

    expect(screen.getByRole("img", { name: "shot.png" })).toHaveAttribute(
      "src",
      "data:image/png;base64,abc",
    );
  });

  it("maps annotation turns to a labeled group", () => {
    const turns: SessionTurn[] = [
      {
        kind: "annotation",
        title: "Model changed",
        timestamp: "2026-03-22T14:41:42.000Z",
        model: "gpt-5-codex",
        parts: [{ partType: "model_change", payload: { model: "gpt-5-codex" } }],
      },
    ];

    const { container } = render(<SessionTimeline turns={turns} />);

    expect(screen.getByText("Model changed")).toBeInTheDocument();
    const row = container.querySelector('[data-slot="trace-ledger-row"]');
    expect(row).toHaveAttribute("data-kind", "config");
    expect(screen.getByText("gpt-5-codex")).toBeInTheDocument();
  });
});

describe("SessionDetailView", () => {
  it("keeps detail content inside an internal scroll pane", () => {
    const session = makeLargeSessionDetail(12);

    const { container } = render(<SessionDetailView session={session} sessionId={session.id} />);

    expect(screen.getByTestId("session-detail-view")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden",
    );
    expect(screen.getByTestId("session-detail-scroll-body")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-x-hidden",
      "overflow-y-auto",
    );
    expect(screen.getByTestId("session-summary-grid")).toHaveClass(
      "grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]",
    );
    expect(screen.getByTestId("session-summary-grid")).not.toHaveClass("lg:grid-cols-5");
    const kpis = container.querySelectorAll('[data-slot="kpi"]');
    expect(kpis).toHaveLength(5);
    for (const kpi of kpis) {
      expect(kpi).toHaveClass("pi-kpi--inline");
    }
    const [totalCostValue, totalTokensValue] = container.querySelectorAll('[data-slot="kpi-value"]');
    expect(totalCostValue).toHaveClass(
      "min-w-0",
      "truncate",
      "text-right",
    );
    expect(totalTokensValue).toHaveClass(
      "min-w-0",
      "truncate",
      "text-right",
    );
    expect(screen.getByTestId("session-primary-model-value")).toHaveClass(
      "min-w-0",
      "truncate",
      "text-right",
    );
    expect(screen.getByTestId("timeline-viewport")).toBeInTheDocument();
  });

  it("keeps a single scroll context and no back navigation", () => {
    const session = makeLargeSessionDetail(12);

    render(<SessionDetailView session={session} sessionId={session.id} />);

    // The outer scroll body is the only scroller — the ledger viewport must
    // not nest a second one.
    expect(screen.getByTestId("timeline-viewport")).not.toHaveClass(
      "overflow-auto",
      "max-h-[72vh]",
    );
    // The sidebar list is always visible; a back-to-empty-state link is dead
    // weight.
    expect(screen.queryByRole("link", { name: /Trace/ })).not.toBeInTheDocument();
  });
});
