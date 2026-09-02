import { beforeEach, describe, expect, it } from "vitest";
import {
  browserUrlStorageKey,
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

    expect(getProjectBrowserUrl("/projects/alpha")).toBe("http://localhost:5173/about");
    expect(getProjectBrowserUrl("/projects/beta")).toBe("http://localhost:3000/");
    expect(getProjectBrowserUrl("/projects/unknown")).toBeNull();
  });

  it("treats unreadable storage as no memory instead of failing the surface", () => {
    window.localStorage.setItem(browserUrlStorageKey, "{not json");
    expect(getProjectBrowserUrl("/projects/alpha")).toBeNull();

    // A corrupt store must still be recoverable by the next write.
    rememberProjectBrowserUrl("/projects/alpha", "http://localhost:5173/");
    expect(getProjectBrowserUrl("/projects/alpha")).toBe("http://localhost:5173/");
  });
});
