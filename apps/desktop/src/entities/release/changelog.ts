export type ChangelogRelease = {
  version: string;
  /** Release calendar date, kept stable across the reader's time zone. */
  date: string;
  title: string;
  summary: string;
  url: string;
  changes: readonly {
    kind: "added" | "improved" | "fixed";
    title: string;
    description: string;
  }[];
};

// Ship release notes with the app so the history is also available offline.
export const changelogReleases: readonly ChangelogRelease[] = [
  {
    version: "0.0.1",
    date: "2026-09-06",
    title: "A workspace for Pi",
    summary: "The first PiGUI release brings Pi Agent to your macOS desktop.",
    url: "https://github.com/BubblePtr/PiGUI/releases/tag/v0.0.1",
    changes: [
      {
        kind: "added",
        title: "Projects and sessions",
        description: "Create, resume, and manage Pi sessions by project.",
      },
      {
        kind: "added",
        title: "Chat and trajectory",
        description: "Follow conversations, inspect tool calls, and see token usage and costs.",
      },
      {
        kind: "added",
        title: "Browser and terminal",
        description: "Preview pages in browser tabs, send page annotations to your session, and work in the built-in terminal.",
      },
      {
        kind: "added",
        title: "Providers and models",
        description: "Connect your providers, choose a model, and adjust its thinking level.",
      },
    ],
  },
];
