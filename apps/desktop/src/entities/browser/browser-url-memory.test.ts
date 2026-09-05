import { beforeEach, describe, expect, it } from "vitest";
import {
  browserUrlStorageKey,
  getProjectBrowserTabs,
  rememberProjectBrowserTabs,
  getProjectBrowserUrl,
  rememberProjectBrowserUrl,
} from "@/entities/browser/browser-url-memory";

describe("browser URL memory", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("remembers the last URL per Project", () => {
    rememberProjectBrowserUrl("/projects/alpha", "http://localhost:5173/");
    rememberProjectBrowserUrl("/projects/beta", "http://localhost:3000/");
    rememberProjectBrowserUrl("/projects/alpha", "http://localhost:5173/about");

    expect(getProjectBrowserUrl("/projects/alpha")).toBe(
      "http://localhost:5173/about",
    );
    expect(getProjectBrowserUrl("/projects/beta")).toBe(
      "http://localhost:3000/",
    );
    expect(getProjectBrowserUrl("/projects/unknown")).toBeNull();
  });

  it("treats unreadable storage as no memory instead of failing the surface", () => {
    window.localStorage.setItem(browserUrlStorageKey, "{not json");
    expect(getProjectBrowserUrl("/projects/alpha")).toBeNull();

    // A corrupt store must still be recoverable by the next write.
    rememberProjectBrowserUrl("/projects/alpha", "http://localhost:5173/");
    expect(getProjectBrowserUrl("/projects/alpha")).toBe(
      "http://localhost:5173/",
    );
  });
});

describe("Browser tab group memory", () => {
  beforeEach(() => window.localStorage.clear());
  it("migrates the old single URL and keeps groups isolated by Project", () => {
    window.localStorage.setItem(
      browserUrlStorageKey,
      JSON.stringify({ a: "http://localhost:3000/" }),
    );
    expect(getProjectBrowserTabs("a")).toEqual({
      tabs: ["http://localhost:3000/"],
      activeIndex: 0,
    });
    rememberProjectBrowserTabs("b", {
      tabs: ["http://localhost:4000/", ""],
      activeIndex: 1,
    });
    expect(getProjectBrowserTabs("b")).toEqual({
      tabs: ["http://localhost:4000/", ""],
      activeIndex: 1,
    });
    expect(getProjectBrowserTabs("a").tabs).toHaveLength(1);
  });
  it("persists the all-closed state without resurrecting a legacy URL", () => {
    rememberProjectBrowserUrl("a", "http://localhost:3000/");
    rememberProjectBrowserTabs("a", { tabs: [], activeIndex: -1 });
    expect(getProjectBrowserTabs("a")).toEqual({ tabs: [], activeIndex: -1 });
  });
});
