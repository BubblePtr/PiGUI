import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createGitMetadataWatchers } from "./git-metadata-watcher";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach((close) => close()); vi.restoreAllMocks(); });
function repository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "git-watch-")));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "pipe" }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Watcher test");
  git("config", "user.email", "watcher@example.test");
  writeFileSync(join(root, "file.txt"), "initial\n");
  git("add", ".");
  git("commit", "-m", "initial");
  return { root, git };
}

it.each(["regular", "linked"])("observes external checkout, stage and commit in a %s checkout", async (kind) => {
  const repositoryFixture = repository();
  const root = kind === "linked" ? join(repositoryFixture.root, "linked") : repositoryFixture.root;
  if (kind === "linked") repositoryFixture.git("worktree", "add", "--detach", root);
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  const changed = vi.fn();
  const watchers = createGitMetadataWatchers(changed);
  cleanup.push(() => watchers.dispose());
  await watchers.associate("a", root);
  for (const change of [
    () => git("checkout", "-b", "topic"),
    () => { writeFileSync(join(root, "file.txt"), "staged\n"); git("add", "."); },
    () => git("commit", "-m", "staged"),
  ]) {
    changed.mockClear();
    change();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(root), { timeout: 2000, interval: 20 });
  }
});

it("observes shared nested refs and packed refs from a detached linked worktree", async () => {
  const { root, git } = repository();
  const linked = join(root, "linked");
  git("branch", "nested/topic");
  git("worktree", "add", "--detach", linked);
  const changed = vi.fn();
  const watchers = createGitMetadataWatchers(changed);
  cleanup.push(() => watchers.dispose());
  await watchers.associate("linked", linked);
  // No HEAD/index writes in this checkout: only its shared ref changes.
  git("update-ref", "refs/heads/nested/topic", git("commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "other commit"));
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(linked), { timeout: 2000, interval: 20 });
  changed.mockClear();
  git("pack-refs", "--all");
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(linked), { timeout: 2000, interval: 20 });
  changed.mockClear();
  execFileSync("git", ["-C", linked, "checkout", "nested/topic"], { stdio: "pipe" });
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(linked), { timeout: 2000, interval: 20 });
});

it("rebinds replaced refs directories and discovers new nested refs", async () => {
  const { root, git } = repository();
  git("branch", "nested/topic");
  const changed = vi.fn();
  const watchers = createGitMetadataWatchers(changed);
  cleanup.push(() => watchers.dispose());
  await watchers.associate("a", root);
  const refs = join(root, git("rev-parse", "--git-path", "refs"));
  cpSync(refs, `${refs}-replacement`, { recursive: true });
  renameSync(refs, `${refs}-old`);
  renameSync(`${refs}-replacement`, refs);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2000, interval: 20 });
  changed.mockClear();
  git("update-ref", "refs/heads/nested/topic", git("commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "replacement"));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2000, interval: 20 });
  changed.mockClear();
  git("branch", "new/deep/topic");
  await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2000, interval: 20 });
  changed.mockClear();
  git("update-ref", "refs/heads/new/deep/topic", git("commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "new ref"));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 2000, interval: 20 });
});

it("shares handles until the final session leaves and cancels pending discovery", async () => {
  const { root } = repository();
  const watch = vi.spyOn(fs, "watch");
  const watchers = createGitMetadataWatchers(vi.fn());
  cleanup.push(() => watchers.dispose());
  await watchers.associate("a", root);
  const count = watch.mock.results.length;
  expect(count).toBeGreaterThan(0);
  const closes = watch.mock.results.map((result) => vi.spyOn(result.value, "close"));
  await watchers.associate("b", root);
  expect(watch).toHaveBeenCalledTimes(count);
  watchers.remove("a");
  closes.forEach((close) => expect(close).not.toHaveBeenCalled());
  watchers.remove("b");
  closes.forEach((close) => expect(close).toHaveBeenCalledTimes(1));
  const ready = watchers.associate("pending", root);
  watchers.remove("pending");
  await ready;
  expect(watch).toHaveBeenCalledTimes(count);
});

it("recovers a watcher error and handles an event without a filename", async () => {
  const { root, git } = repository();
  const watch = vi.spyOn(fs, "watch");
  const changed = vi.fn();
  const watchers = createGitMetadataWatchers(changed);
  cleanup.push(() => watchers.dispose());
  await watchers.associate("a", root);
  const handle = watch.mock.results[0]!.value as fs.FSWatcher;
  const close = vi.spyOn(handle, "close");
  // Fault injection uses real handles; filesystem event delivery remains native.
  handle.emit("error", new Error("watch lost"));
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(root), { timeout: 2000, interval: 20 });
  expect(close).toHaveBeenCalled();
  changed.mockClear();
  const recovered = watch.mock.results[watch.mock.results.length - 1]!.value as fs.FSWatcher;
  recovered.emit("change", "rename", null);
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(root), { timeout: 2000, interval: 20 });
  changed.mockClear();
  git("checkout", "-b", "after-error");
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(root), { timeout: 2000, interval: 20 });
});

it("retries metadata discovery when resume recreates an absent checkout", async () => {
  const { root, git } = repository();
  const restored = join(root, "restored");
  const changed = vi.fn();
  const watchers = createGitMetadataWatchers(changed);
  cleanup.push(() => watchers.dispose());
  await watchers.associate("a", restored);
  git("worktree", "add", "--detach", restored);
  await watchers.associate("a", restored);
  execFileSync("git", ["-C", restored, "checkout", "-b", "restored"], { stdio: "pipe" });
  await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(restored), { timeout: 2000, interval: 20 });
});
