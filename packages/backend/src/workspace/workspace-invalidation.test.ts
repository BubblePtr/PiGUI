import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createWorkspaceInvalidation } from "./workspace-invalidation";

afterEach(() => vi.useRealTimers());

it("bounds continuous tool bursts and flushes pending work at termination", () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const scheduler = createWorkspaceInvalidation(emit);
  scheduler.associate("a", "/repo");
  for (let i = 0; i < 5; i++) {
    scheduler.invalidate("a");
    vi.advanceTimersByTime(400);
  }
  expect(emit).toHaveBeenCalledTimes(1);
  scheduler.invalidate("a");
  scheduler.flush("a");
  scheduler.flush("a");
  vi.advanceTimersByTime(5000);
  expect(emit).toHaveBeenCalledTimes(2);
});

it("releases removed and relocated sessions and cancels orphaned timers", () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const scheduler = createWorkspaceInvalidation(emit);
  scheduler.associate("a", "/repo");
  scheduler.associate("b", "/repo");
  scheduler.invalidate("a");
  scheduler.remove("a");
  scheduler.associate("b", "/new");
  vi.advanceTimersByTime(5000);
  expect(emit).not.toHaveBeenCalled();
  scheduler.invalidate("b");
  scheduler.dispose();
  vi.advanceTimersByTime(5000);
  expect(emit).not.toHaveBeenCalled();
});

it("coalesces tools across sessions sharing a normalized checkout", () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const scheduler = createWorkspaceInvalidation(emit);
  scheduler.associate("a", "/repo/child/..");
  scheduler.associate("b", "/repo");
  scheduler.associate("other", "/worktree");
  scheduler.invalidate("a");
  vi.advanceTimersByTime(300);
  scheduler.invalidate("b");
  vi.advanceTimersByTime(499);
  expect(emit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(emit).toHaveBeenCalledExactlyOnceWith({ checkoutId: "/repo", sessionIds: ["a", "b"], source: "tool" });
});

it("fans out across real and symlink checkout roots", () => {
  const root = mkdtempSync(join(tmpdir(), "invalidation-"));
  const alias = `${root}-alias`;
  symlinkSync(root, alias, "dir");
  const emit = vi.fn();
  const scheduler = createWorkspaceInvalidation(emit);
  try {
    scheduler.associate("a", root);
    scheduler.associate("b", alias);
    scheduler.invalidate("a");
    scheduler.flush("a");
    expect(emit).toHaveBeenCalledExactlyOnceWith({
      checkoutId: realpathSync(root), sessionIds: ["a", "b"], source: "tool",
    });
  } finally {
    scheduler.dispose();
    rmSync(alias);
    rmSync(root, { recursive: true });
  }
});

it("coalesces Git and tool signals in the same checkout debounce", () => {
  vi.useFakeTimers();
  const emit = vi.fn();
  const scheduler = createWorkspaceInvalidation(emit);
  scheduler.associate("a", "/repo");
  scheduler.associate("b", "/repo");
  scheduler.invalidate("a");
  vi.advanceTimersByTime(300);
  scheduler.invalidateCheckout("/repo", "git-watch");
  vi.advanceTimersByTime(499);
  expect(emit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(emit).toHaveBeenCalledExactlyOnceWith({ checkoutId: "/repo", sessionIds: ["a", "b"], source: "git-watch" });
  scheduler.remove("a");
  scheduler.remove("b");
  scheduler.invalidateCheckout("/repo", "git-watch");
  vi.advanceTimersByTime(5000);
  expect(emit).toHaveBeenCalledTimes(1);
});
