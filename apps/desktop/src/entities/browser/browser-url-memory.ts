/**
 * Last previewed URL per Project, kept in the renderer's localStorage.
 *
 * PiGUI has no knowledge of dev servers, so the address the user typed is the
 * only signal about what a Project's preview URL is. It is a convenience, not
 * a record: no backend persistence (PRD decision 2).
 */
export const browserUrlStorageKey = "pigui.browserUrls.v1";

function readStore(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(browserUrlStorageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function getProjectBrowserUrl(projectId: string) {
  const url = readStore()[projectId];

  return typeof url === "string" && url ? url : null;
}

export function rememberProjectBrowserUrl(projectId: string, url: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      browserUrlStorageKey,
      JSON.stringify({ ...readStore(), [projectId]: url }),
    );
  } catch {
    // A full or blocked store only costs the convenience, never the surface.
  }
}

export type ProjectBrowserTabs = { tabs: string[]; activeIndex: number };
export const browserTabsStorageKey = "pigui.browserTabs.v1";

function readTabStore(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(browserTabsStorageKey) ?? "{}",
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function getProjectBrowserTabs(projectId: string): ProjectBrowserTabs {
  const record = readTabStore()[projectId] as
    Partial<ProjectBrowserTabs> | undefined;
  if (
    record &&
    Array.isArray(record.tabs) &&
    record.tabs.every((url) => typeof url === "string")
  ) {
    const tabs = record.tabs;
    const index = record.activeIndex;
    return {
      tabs,
      activeIndex:
        tabs.length === 0
          ? -1
          : typeof index === "number" &&
              Number.isInteger(index) &&
              index >= 0 &&
              index < tabs.length
            ? index
            : 0,
    };
  }
  const legacy = getProjectBrowserUrl(projectId);
  return { tabs: legacy ? [legacy] : [], activeIndex: legacy ? 0 : -1 };
}

export function rememberProjectBrowserTabs(
  projectId: string,
  group: ProjectBrowserTabs,
) {
  try {
    window.localStorage.setItem(
      browserTabsStorageKey,
      JSON.stringify({ ...readTabStore(), [projectId]: group }),
    );
  } catch {
    // Persistence is a convenience; a blocked store must not break live tabs.
  }
}
