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
    version: "0.0.2",
    date: "2026-09-08",
    title: "Chat freely, stay up to date",
    summary: "Start a conversation without a project, update PiGUI in the app, and find sessions more easily.",
    url: "https://github.com/BubblePtr/PiGUI/releases/tag/v0.0.2",
    changes: [
      {
        kind: "added",
        title: "Projectless Chat",
        description: "Start a chat without choosing a repository. Manage chats in their own sidebar group and configure their workspace in Settings.",
      },
      {
        kind: "added",
        title: "In-app updates",
        description: "Check, download, and install future releases from About & Updates, with update indicators in the sidebar and an entry in the macOS app menu. Upgrade from v0.0.1 manually once to enable this.",
      },
      {
        kind: "added",
        title: "Release history",
        description: "Read release notes in Settings, even offline, and open the full release on GitHub.",
      },
      {
        kind: "improved",
        title: "Settings in place",
        description: "Open Settings in a dialog while keeping your current session and unsent draft in place.",
      },
      {
        kind: "improved",
        title: "Find your trajectory",
        description: "Filter sessions by presence, switch between recent and project ordering, identify archived sessions, and open a trajectory from the sidebar.",
      },
      {
        kind: "fixed",
        title: "More predictable chat interactions",
        description: "Session titles follow Pi name changes, the branch selector appears after creating a project session, and single tool calls expand with one click. New Chat navigation, workspace recovery, and chat styling are more consistent.",
      },
      {
        kind: "fixed",
        title: "Explicit browser and terminal creation",
        description: "Opening an empty dock surface no longer creates a browser tab or terminal automatically; create one when you need it.",
      },
    ],
  },
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
