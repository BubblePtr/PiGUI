import { describe, expect, it } from "vitest";
import { distinctProjects, filterByProject } from "./session-list";

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
