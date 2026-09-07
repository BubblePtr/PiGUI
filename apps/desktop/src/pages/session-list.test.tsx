import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  SessionListPanel,
  distinctProjects,
  filterByPresence,
  filterByProjects,
  groupByProject,
  projectTokenColor,
  readSessionListOrder,
  sessionListOrderStorageKey,
  sortByRecency,
} from "@/pages/session-list";
import type { SessionSummary } from "@/entities/session/sessions";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/runtime")>();

  return { ...actual, invoke: invokeMock };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    Link: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => <a className={className}>{children}</a>,
  };
});

beforeEach(() => {
  // Default: a never-settling invoke keeps the panel in its loading state.
  invokeMock.mockReset();
  invokeMock.mockImplementation(() => new Promise(() => {}));
  window.localStorage.clear();
});

function makeSummary(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
  return {
    timestamp: "2026-08-09T08:00:00.000Z",
    project: "alpha",
    title: { kind: "text", sentence: "Fix the parser." },
    totalCostUsd: 0.0123,
    totalTokens: 45_600,
    primaryModel: "gpt-5",
    modelBreakdown: [],
    toolCounts: [],
    skillCounts: [],
    presence: "external",
    ...overrides,
  };
}

type Row = { project: string };

const rows: Row[] = [
  { project: "project-beta" },
  { project: "project-alpha" },
  { project: "project-beta" },
  { project: "project-gamma" },
];

describe("distinctProjects", () => {
  it("returns unique project names sorted alphabetically", () => {
    expect(distinctProjects(rows)).toEqual([
      "project-alpha",
      "project-beta",
      "project-gamma",
    ]);
  });

  it("returns an empty list when there are no sessions", () => {
    expect(distinctProjects([])).toEqual([]);
  });
});

describe("filterByProjects", () => {
  it("returns every session when no projects are selected", () => {
    expect(filterByProjects(rows, [])).toHaveLength(rows.length);
  });

  it("keeps sessions from any selected project, preserving order", () => {
    expect(filterByProjects(rows, ["project-beta", "project-gamma"])).toEqual([
      { project: "project-beta" },
      { project: "project-beta" },
      { project: "project-gamma" },
    ]);
  });
});

function renderWithQueryClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("projectTokenColor", () => {
  it("assigns a stable palette color per project name", () => {
    const palette = ["blue", "green", "teal", "cyan", "purple", "pink", "orange", "yellow"];

    expect(projectTokenColor("backend")).toBe(projectTokenColor("backend"));
    expect(palette).toContain(projectTokenColor("backend"));
    expect(palette).toContain(projectTokenColor("语音输入法"));
  });
});

describe("groupByProject", () => {
  it("groups sessions by project alphabetically, preserving recency inside a group", () => {
    const sessions = [
      makeSummary({ id: "s1", project: "beta" }),
      makeSummary({ id: "s2", project: "alpha" }),
      makeSummary({ id: "s3", project: "beta" }),
    ];

    expect(groupByProject(sessions)).toEqual([
      { project: "alpha", sessions: [sessions[1]] },
      { project: "beta", sessions: [sessions[0], sessions[2]] },
    ]);
  });
});

describe("SessionListPanel", () => {
  it("renders the multi-project filter with the Astryx Tokenizer", async () => {
    const { container } = renderWithQueryClient(<SessionListPanel />);

    expect(
      await screen.findByRole("combobox", { name: "Filter by projects" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".astryx-tokenizer")).toBeInTheDocument();
  });

  it("is a flat sidebar panel — no Card wrapper — that fits the fixed workspace", async () => {
    const { container } = renderWithQueryClient(<SessionListPanel />);

    expect(
      await screen.findByRole("combobox", { name: "Filter by projects" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".astryx-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("session-list-panel")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden",
    );
  });

  it("uses the Astryx EmptyState for transient list states", () => {
    const { container } = renderWithQueryClient(<SessionListPanel />);

    expect(screen.getByText("Loading sessions...")).toBeInTheDocument();
    expect(container.querySelector(".astryx-empty-state")).toBeInTheDocument();
  });
});

describe("SessionListPanel with sessions", () => {
  it("renders project group headers with counts and tabular-nums cost metadata", async () => {
    window.localStorage.setItem(sessionListOrderStorageKey, "project");
    invokeMock.mockResolvedValue([
      makeSummary({ id: "s1", project: "beta" }),
      makeSummary({ id: "s2", project: "alpha", totalCostUsd: 0.2, totalTokens: 1_200_000 }),
      makeSummary({ id: "s3", project: "beta" }),
    ]);

    renderWithQueryClient(<SessionListPanel />);

    const groups = await screen.findAllByTestId("session-group");
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByText("alpha")).toBeInTheDocument();
    expect(within(groups[0]).getByText("1")).toBeInTheDocument();
    expect(within(groups[1]).getByText("beta")).toBeInTheDocument();
    expect(within(groups[1]).getByText("2")).toBeInTheDocument();

    // Group headers must read as a different hierarchy level than rows:
    // sticky uppercase micro-labels on an opaque background.
    const header = within(groups[0]).getByText("alpha").closest("header");
    expect(header).toHaveClass("sticky", "top-0", "bg-background");
    expect(within(groups[0]).getByText("alpha")).toHaveClass(
      "uppercase",
      "tracking-wider",
      "text-muted",
    );

    const cost = screen.getByText("$0.2000");
    expect(cost).toHaveClass("tabular-nums", "text-right");
  });
});

describe("sortByRecency", () => {
  it("orders sessions newest first regardless of project", () => {
    const sorted = sortByRecency([
      makeSummary({ id: "old", project: "alpha", timestamp: "2026-08-01T00:00:00.000Z" }),
      makeSummary({ id: "new", project: "zeta", timestamp: "2026-08-09T00:00:00.000Z" }),
      makeSummary({ id: "mid", project: "beta", timestamp: "2026-08-05T00:00:00.000Z" }),
    ]);

    expect(sorted.map((session) => session.id)).toEqual(["new", "mid", "old"]);
  });
});

describe("readSessionListOrder", () => {
  it("defaults to recent and ignores unknown stored values", () => {
    expect(readSessionListOrder()).toBe("recent");
    window.localStorage.setItem(sessionListOrderStorageKey, "bogus");
    expect(readSessionListOrder()).toBe("recent");
    window.localStorage.setItem(sessionListOrderStorageKey, "project");
    expect(readSessionListOrder()).toBe("project");
  });
});

describe("SessionListPanel ordering", () => {
  const sessions = [
    makeSummary({ id: "old", project: "alpha", timestamp: "2026-08-01T00:00:00.000Z" }),
    makeSummary({ id: "new", project: "zeta", timestamp: "2026-08-09T00:00:00.000Z" }),
    makeSummary({ id: "mid", project: "beta", timestamp: "2026-08-05T00:00:00.000Z" }),
  ];

  it("defaults to a flat newest-first list with a project chip per row", async () => {
    invokeMock.mockResolvedValue(sessions);

    renderWithQueryClient(<SessionListPanel />);

    const list = await screen.findByTestId("session-recent-list");
    const rowProjects = within(list)
      .getAllByTestId("session-row-project")
      .map((chip) => chip.textContent);
    expect(rowProjects).toEqual(["zeta", "beta", "alpha"]);
    expect(screen.queryByTestId("session-group")).not.toBeInTheDocument();
  });

  it("switches to project grouping and remembers the choice", async () => {
    invokeMock.mockResolvedValue(sessions);

    renderWithQueryClient(<SessionListPanel />);
    await screen.findByTestId("session-recent-list");

    fireEvent.click(screen.getByRole("radio", { name: "Project" }));

    const groups = await screen.findAllByTestId("session-group");
    expect(groups.map((group) => within(group).getByTestId("session-group-project").textContent)).toEqual([
      "alpha",
      "beta",
      "zeta",
    ]);
    expect(screen.queryByTestId("session-recent-list")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(sessionListOrderStorageKey)).toBe("project");
  });
});

describe("filterByPresence", () => {
  const sessions = [
    makeSummary({ id: "a", presence: "active" }),
    makeSummary({ id: "b", presence: "archived" }),
    makeSummary({ id: "c", presence: "external" }),
  ];

  it("returns every session for all and only the matching presence otherwise", () => {
    expect(filterByPresence(sessions, "all").map((session) => session.id)).toEqual(["a", "b", "c"]);
    expect(filterByPresence(sessions, "archived").map((session) => session.id)).toEqual(["b"]);
  });
});

describe("SessionListPanel presence", () => {
  it("marks archived rows and filters by presence from the selector", async () => {
    invokeMock.mockResolvedValue([
      makeSummary({ id: "a", presence: "active", timestamp: "2026-08-09T00:00:00.000Z" }),
      makeSummary({ id: "b", presence: "archived", timestamp: "2026-08-08T00:00:00.000Z" }),
      makeSummary({ id: "c", presence: "external", timestamp: "2026-08-07T00:00:00.000Z" }),
    ]);

    renderWithQueryClient(<SessionListPanel />);

    const list = await screen.findByTestId("session-recent-list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getAllByTestId("session-row-archived")).toHaveLength(1);

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Presence" }));
    await user.click(await screen.findByRole("option", { name: "Archived" }));

    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByTestId("session-row-archived")).toBeInTheDocument();
  });
});
