import { beforeEach, describe, expect, it } from "vitest";
import {
  addProjectToRegistry,
  getProjectRegistry,
  renameProjectInRegistry,
} from "@/entities/project/project-registry";

describe("Project Registry", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists manually added local directories by normalized absolute path", () => {
    const first = addProjectToRegistry("/Users/void/code/opensource/Pig/./", {
      now: () => "2026-06-30T08:00:00.000Z",
    });
    const second = addProjectToRegistry("/Users/void/Documents/study", {
      now: () => "2026-06-30T09:00:00.000Z",
    });

    expect(first).toMatchObject({
      added: true,
      project: {
        id: "/Users/void/code/opensource/Pig",
        path: "/Users/void/code/opensource/Pig",
        displayName: "Pig",
        addedAt: "2026-06-30T08:00:00.000Z",
      },
    });
    expect(second).toMatchObject({
      added: true,
      project: {
        id: "/Users/void/Documents/study",
        path: "/Users/void/Documents/study",
        displayName: "study",
        addedAt: "2026-06-30T09:00:00.000Z",
      },
    });
    expect(getProjectRegistry().map((project) => project.id)).toEqual([
      "/Users/void/Documents/study",
      "/Users/void/code/opensource/Pig",
    ]);
    expect(window.localStorage.getItem("pig.projectRegistry.v1")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("pigui.projectRegistry.v1") ?? "[]"))
      .toHaveLength(2);
  });

  it("does not read obsolete pig namespace registry data", () => {
    window.localStorage.setItem(
      "pig.projectRegistry.v1",
      JSON.stringify([
        {
          id: "/Users/void/code/opensource/Pig",
          path: "/Users/void/code/opensource/Pig",
          displayName: "Pig",
          addedAt: "2026-06-30T08:00:00.000Z",
        },
      ]),
    );

    expect(getProjectRegistry()).toEqual([]);
  });

  it("selects an existing normalized path without creating a duplicate Project", () => {
    addProjectToRegistry("/Users/void/code/opensource/Pig", {
      now: () => "2026-06-30T08:00:00.000Z",
    });
    const duplicate = addProjectToRegistry("/Users/void/code/opensource/Pig/packages/../", {
      now: () => "2026-06-30T10:00:00.000Z",
    });

    expect(duplicate).toMatchObject({
      added: false,
      project: {
        id: "/Users/void/code/opensource/Pig",
        addedAt: "2026-06-30T08:00:00.000Z",
      },
    });
    expect(getProjectRegistry()).toHaveLength(1);
  });

  it("does not require Git metadata when adding a Project", () => {
    addProjectToRegistry("/Users/void/Documents/notes-without-git", {
      now: () => "2026-06-30T08:00:00.000Z",
    });

    expect(getProjectRegistry()[0]).toMatchObject({
      id: "/Users/void/Documents/notes-without-git",
      displayName: "notes-without-git",
    });
  });

  it("renames a Project display name without changing its identity or ordering", () => {
    addProjectToRegistry("/Users/void/code/opensource/Pig", {
      now: () => "2026-06-30T08:00:00.000Z",
    });
    addProjectToRegistry("/Users/void/Documents/study", {
      now: () => "2026-06-30T09:00:00.000Z",
    });

    const renamed = renameProjectInRegistry(
      "/Users/void/code/opensource/Pig/.",
      "  PiGUI Desktop  ",
    );

    expect(renamed).toMatchObject({
      id: "/Users/void/code/opensource/Pig",
      path: "/Users/void/code/opensource/Pig",
      displayName: "PiGUI Desktop",
      addedAt: "2026-06-30T08:00:00.000Z",
    });
    expect(getProjectRegistry().map((project) => project.displayName)).toEqual([
      "study",
      "PiGUI Desktop",
    ]);
  });

  it("ignores blank Project display names", () => {
    addProjectToRegistry("/Users/void/code/opensource/Pig", {
      now: () => "2026-06-30T08:00:00.000Z",
    });

    expect(renameProjectInRegistry("/Users/void/code/opensource/Pig", "   ")).toBeNull();
    expect(getProjectRegistry()[0]).toMatchObject({
      displayName: "Pig",
    });
  });
});
