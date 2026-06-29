import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { SessionListPanel, distinctProjects, filterByProject } from "@/pages/session-list";

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

describe("filterByProject", () => {
  it("returns every session when no project is selected", () => {
    expect(filterByProject(rows, null)).toHaveLength(rows.length);
  });

  it("keeps only sessions for the selected project, preserving order", () => {
    expect(filterByProject(rows, "project-beta")).toEqual([
      { project: "project-beta" },
      { project: "project-beta" },
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

describe("SessionListPanel", () => {
  it("renders the project filter with HeroUI Pro NativeSelect", async () => {
    const { container } = renderWithQueryClient(<SessionListPanel />);

    expect(await screen.findByLabelText("Filter by project")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="native-select"]')).toBeInTheDocument();
  });

  it("fits inside a fixed trace workspace without forcing page scroll", async () => {
    const { container } = renderWithQueryClient(<SessionListPanel />);

    expect(await screen.findByLabelText("Filter by project")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden",
    );
  });

  it("uses HeroUI EmptyState for transient list states", () => {
    const { container } = renderWithQueryClient(<SessionListPanel />);

    expect(screen.getByText("Loading sessions...")).toBeInTheDocument();
    expect(container.querySelector('[data-slot="empty-state"]')).toBeInTheDocument();
  });
});
