import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ChangelogSection } from "./settings-changelog";
import type { ChangelogRelease } from "@/entities/release/changelog";
import { invoke } from "@/shared/runtime";

vi.mock("@/shared/runtime", () => ({
  isElectronRuntime: () => true,
  invoke: vi.fn(),
}));

const olderRelease: ChangelogRelease = {
  version: "1.0.0",
  date: "2026-08-01",
  title: "First test release",
  summary: "A test release summary.",
  url: "https://github.com/BubblePtr/pace/releases/tag/v1.0.0",
  changes: [{ kind: "added", title: "Test feature", description: "An available feature." }],
};
const newerRelease: ChangelogRelease = {
  ...olderRelease,
  version: "1.1.0",
  date: "2026-08-15",
  title: "Second test release",
  changes: [
    { kind: "improved", title: "Better navigation", description: "Fewer clicks." },
    { kind: "fixed", title: "Restored drafts", description: "Drafts survive navigation." },
  ],
};

describe("Changelog timeline", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("ships v0.0.2 notes offline and preserves the first release", () => {
    render(<ChangelogSection />);
    const entries = within(screen.getByRole("list", { name: "Release history" })).getAllByRole("article");
    expect(within(entries[0]).getByRole("heading", { name: "v0.0.2" })).toBeVisible();
    expect(within(entries[0]).getByText("Projectless Chat")).toBeVisible();
    expect(within(entries[0]).getByText("In-app updates")).toBeVisible();
    expect(within(entries[0]).getByRole("link", { name: /View release on GitHub/ })).toHaveAttribute("href", "https://github.com/BubblePtr/pace/releases/tag/v0.0.2");
    expect(within(entries[1]).getByRole("heading", { name: "v0.0.1" })).toBeVisible();
  });

  it("opens release notes in the system browser in the desktop app", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null);
    render(<ChangelogSection releases={[olderRelease]} />);
    await userEvent.click(screen.getByRole("link", { name: /View release on GitHub/ }));
    expect(invoke).toHaveBeenCalledWith("browser_open_external", { url: olderRelease.url });
  });

  it("reports a failed external navigation and lets the user retry", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Browser unavailable"));
    render(<ChangelogSection releases={[olderRelease]} />);
    const link = screen.getByRole("link", { name: /View release on GitHub/ });
    await userEvent.click(link);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open the release. Try again.");
    vi.mocked(invoke).mockResolvedValueOnce(null);
    await userEvent.click(link);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("orders releases newest first without mutating the source and groups user-facing changes", () => {
    const releases = Object.freeze([olderRelease, newerRelease]);
    render(<ChangelogSection releases={releases} />);

    const timeline = screen.getByRole("list", { name: "Release history" });
    const entries = within(timeline).getAllByRole("article");
    expect(within(entries[0]).getByRole("heading", { name: "v1.1.0" })).toBeVisible();
    expect(within(entries[1]).getByRole("heading", { name: "v1.0.0" })).toBeVisible();
    expect(within(entries[0]).getByText("Latest")).toBeVisible();
    expect(within(entries[1]).queryByText("Latest")).not.toBeInTheDocument();
    expect(within(entries[0]).getByRole("heading", { name: "Improvements" })).toBeVisible();
    expect(within(entries[0]).getByRole("heading", { name: "Fixes" })).toBeVisible();
    expect(within(entries[0]).queryByRole("heading", { name: "New features" })).not.toBeInTheDocument();
    expect(entries[0].querySelector("time")).toHaveAttribute("dateTime", "2026-08-15");
    expect(releases[0]).toBe(olderRelease);
  });
});
