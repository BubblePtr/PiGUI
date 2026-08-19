import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  makeLargeSessionDetail,
  largeSessionDetailApproxBytes,
} from "@/entities/session/session-detail.fixtures";
import { SessionDetailView } from "@/pages/session-detail";

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

describe("SessionDetailView (Trace Cockpit)", () => {
  it("renders the Cockpit panels: Strip, Tally, filter bar, Ledger, Inspector", () => {
    const session = makeLargeSessionDetail(12);
    const { container } = render(<SessionDetailView session={session} sessionId={session.id} />);

    expect(container.querySelector('[data-slot="trace-strip"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="trace-tally"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="trace-filter-bar"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="trace-ledger"]')).toBeInTheDocument();
    expect(screen.getByText(/Select a step to inspect it/)).toBeInTheDocument();
    // Tally counts Active Runs, not messages.
    expect(container.querySelector('[data-slot="trace-tally"]')?.textContent).toContain("runs");
  });

  it("virtualizes the ledger by Active Run and keeps heavy payloads unmounted", () => {
    const session = makeLargeSessionDetail();
    const { container } = render(<SessionDetailView session={session} sessionId={session.id} />);

    expect(largeSessionDetailApproxBytes).toBeGreaterThan(8 * 1024 * 1024);
    // 128 messages fold into 64 runs; the virtualizer renders a window only.
    expect(container.querySelectorAll("[data-index]").length).toBeLessThan(64);
    // Row previews carry first lines only — the megabyte tool output body
    // never mounts in the ledger.
    expect(screen.queryByText(/1399: large fixture output line/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hidden thinking line 0/)).not.toBeInTheDocument();
  });

  it("pairs toolCall and toolResult into one badge row reading request → result", () => {
    const session = makeLargeSessionDetail(2);
    const { container } = render(<SessionDetailView session={session} sessionId={session.id} />);

    const toolRow = container.querySelector('[data-kind="tool"]');
    expect(toolRow).not.toBeNull();
    expect(toolRow).toHaveAttribute("data-status", "ok");
    expect(within(toolRow as HTMLElement).getByText("read_file")).toBeInTheDocument();
    expect(toolRow?.textContent).toContain("→");
    expect(toolRow?.textContent).toContain("huge output sentinel 0");
  });

  it("opens the Inspector on row selection and mounts the full payload there", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail(2);
    render(<SessionDetailView session={session} sessionId={session.id} />);

    await user.click(screen.getAllByRole("button", { name: /read_file/ })[0]);

    expect(screen.getByText(/Run 1 · Step/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Result" }));
    expect(screen.getByText(/1399: large fixture output line/)).toBeInTheDocument();
  });

  it("shows the Schema tab's honest unavailable state when the current runtime has no definition", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail(2);
    render(<SessionDetailView session={session} sessionId={session.id} />);

    await user.click(screen.getAllByRole("button", { name: /read_file/ })[0]);
    await user.click(screen.getByRole("tab", { name: "Schema" }));

    expect(screen.getByText(/查不到这个工具现在的定义/)).toBeInTheDocument();
  });

  it("shows a resolved Schema when the Gateway returns the current tool definition", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail(2);
    render(
      <SessionDetailView
        session={session}
        sessionId={session.id}
        toolSchemas={{
          read_file: {
            description: "Read a file from disk",
            parameters: {
              type: "object",
              properties: { path: { type: "string" } },
            },
          },
        }}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /read_file/ })[0]);
    await user.click(screen.getByRole("tab", { name: "Schema" }));

    expect(screen.getByText("Read a file from disk")).toBeInTheDocument();
    expect(screen.queryByText(/查不到这个工具现在的定义/)).not.toBeInTheDocument();
  });

  it("filters with the errors chip and reports the visible step count", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail(4);
    const { container } = render(<SessionDetailView session={session} sessionId={session.id} />);

    const tally = () =>
      container.querySelector('[data-slot="trace-filter-bar"] .ml-auto')?.textContent;
    const before = tally();

    await user.click(screen.getByRole("button", { name: "errors" }));
    // The large fixture has no error turns in the first 4 messages.
    expect(tally()).not.toEqual(before);
    expect(screen.getByText(/No steps match the current filters/)).toBeInTheDocument();
  });

  it("renders image steps in the Inspector, including data+mimeType payloads", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail(2);
    render(<SessionDetailView session={session} sessionId={session.id} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Fixture thumbnail 0/ }));
    expect(screen.getByRole("img", { name: "Fixture thumbnail 0" })).toBeInTheDocument();
  });

  it("keeps the ledger inside an internal scroll pane with no back navigation", () => {
    const session = makeLargeSessionDetail(12);
    render(<SessionDetailView session={session} sessionId={session.id} />);

    expect(screen.getByTestId("session-detail-view")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden",
    );
    expect(screen.getByTestId("session-detail-scroll-body")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
    expect(screen.queryByRole("link", { name: /Trace/ })).not.toBeInTheDocument();
  });

  it("renders empty, loading, and error states", () => {
    const { rerender } = render(<SessionDetailView isLoading sessionId="s" />);
    expect(screen.getByText("Loading session...")).toBeInTheDocument();

    rerender(<SessionDetailView isError sessionId="s" />);
    expect(screen.getByText("Could not read this session.")).toBeInTheDocument();

    rerender(
      <SessionDetailView
        session={{ ...makeLargeSessionDetail(0), turns: [] }}
        sessionId="s"
      />,
    );
    expect(screen.getByText("No timeline entries found.")).toBeInTheDocument();
  });
});
