import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeLargeSessionDetail, largeSessionDetailApproxBytes } from "./session-detail.fixtures";
import { SessionDetailView, SessionTimeline, TimelineTurn } from "./session-detail";

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
  it("keeps turn cost and token metadata inside a shrinkable HeroUI chip", () => {
    render(
      <TimelineTurn
        turn={{
          kind: "message",
          role: "assistant",
          timestamp: "2026-03-22T14:41:42.000Z",
          model: "k2p5",
          usage: {
            inputTokens: 21_000,
            outputTokens: 22_800,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 43_800,
          },
          cost: {
            inputUsd: 0.12,
            outputUsd: 0.210091,
            cacheReadUsd: 0,
            cacheWriteUsd: 0,
            totalUsd: 0.330091,
          },
          parts: [{ partType: "text", text: "Read the current workspace state.", payload: {} }],
        }}
      />,
    );

    const cost = screen.getByText("$0.330091");
    const tokens = screen.getByText("43.8K tokens");
    const chip = cost.closest('[data-slot="chip"]');
    const label = cost.closest('[data-slot="chip-label"]');

    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("min-w-0", "max-w-full", "whitespace-normal");
    expect(label).toHaveClass("min-w-0", "max-w-full", "flex-wrap");
    expect(cost).toHaveClass("min-w-0", "max-w-full", "truncate");
    expect(tokens).toHaveClass("min-w-0", "max-w-full", "truncate");
  });

  it("renders the large fixture as collapsed virtual rows by default", () => {
    const session = makeLargeSessionDetail();
    const { container } = render(<SessionTimeline turns={session.turns} />);

    expect(largeSessionDetailApproxBytes).toBeGreaterThan(8 * 1024 * 1024);
    expect(screen.getByText("Plan fixture turn 0")).toBeInTheDocument();
    expect(screen.getAllByText(/\$0\.0/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Inspect the current timeline state.")).not.toBeInTheDocument();
    expect(screen.queryByText("huge output sentinel 0")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-index]").length).toBeLessThan(session.turns.length);
  });

  it("uses half-expanded thinking, folded tools, and inline thumbnails when a turn opens", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail();
    render(<SessionTimeline turns={session.turns} />);

    await user.click(screen.getByRole("button", { name: /Plan fixture turn 0/i }));

    expect(screen.getByText(/Inspect the current timeline state\./)).toBeInTheDocument();
    expect(screen.queryByText(/Hidden thinking line 0/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Show input" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Show output" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText(/cat \/tmp\/fixture-0\.txt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/huge output sentinel 0/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Fixture thumbnail 0" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText(/Hidden thinking line 0/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show input" }));
    expect(screen.getByText(/cat \/tmp\/fixture-0\.txt/)).toBeInTheDocument();
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
    for (const content of container.querySelectorAll('[data-slot="kpi-content"]')) {
      expect(content).toHaveClass("grid-cols-[minmax(0,auto)_minmax(0,1fr)]");
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
});
