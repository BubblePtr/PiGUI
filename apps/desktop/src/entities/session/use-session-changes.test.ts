import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BackendRpcEvent } from "@pace/backend";
import { onBackendEvent } from "@/shared/runtime";
import type { SessionChanges } from "@pace/core";
import {
  sessionChangesBadge,
  useSessionChanges,
} from "@/entities/session/use-session-changes";

vi.mock("@/shared/runtime", () => ({ onBackendEvent: vi.fn(() => () => {}) }));

const emptyTotals = {
  files: 0,
  additions: 0,
  deletions: 0,
  binaryFiles: 0,
  conflictedFiles: 0,
};

function changes(overrides: Partial<SessionChanges> = {}): SessionChanges {
  return {
    sessionId: "session-1",
    state: "ready",
    checkoutRoot: "/work/Pace",
    repositoryRoot: "/work/Pace",
    generatedAt: "2026-09-02T00:00:00.000Z",
    files: [
      {
        path: "src/app.ts",
        kind: "modified",
        staged: false,
        unstaged: true,
        additions: 2,
        deletions: 1,
        binary: false,
        patchTruncated: false,
      },
      {
        path: "src/main.ts",
        kind: "added",
        staged: true,
        unstaged: false,
        additions: 4,
        deletions: 0,
        binary: false,
        patchTruncated: false,
      },
    ],
    totals: { ...emptyTotals, files: 2, additions: 6, deletions: 1 },
    truncated: false,
    omittedFileCount: 0,
    ...overrides,
  };
}

describe("useSessionChanges", () => {
  it("isolates late reads and checkouts across session switches, disable and unmount", async () => {
    const reads: Array<(value: SessionChanges) => void> = [];
    let finishCheckout!: (value: SessionChanges) => void;
    const loadChanges = vi.fn(() => new Promise<SessionChanges>((resolve) => reads.push(resolve)));
    const checkoutSessionBranch = vi.fn(() => new Promise<SessionChanges>((resolve) => { finishCheckout = resolve; }));
    const { result, rerender, unmount } = renderHook(({ sessionId, enabled }) => useSessionChanges({
      sessionId, enabled, loadChanges, checkoutSessionBranch,
    }), { initialProps: { sessionId: "a", enabled: true } });
    const checkout = result.current.checkoutBranch("old-session-branch");
    rerender({ sessionId: "b", enabled: true });
    expect(result.current.changes).toBeNull();
    await act(async () => {
      reads[1](changes({ sessionId: "b" }));
      reads[0](changes({ sessionId: "a" }));
      finishCheckout(changes({ sessionId: "a" }));
      await checkout;
    });
    expect(result.current.changes?.sessionId).toBe("b");
    act(() => result.current.refresh());
    rerender({ sessionId: "b", enabled: false });
    await act(async () => reads[2](changes({ sessionId: "b" })));
    expect(result.current.changes).toBeNull();
    rerender({ sessionId: "b", enabled: true });
    expect(result.current.changes).toBeNull();
    const refresh = result.current.refresh;
    unmount();
    await act(async () => { reads[3](changes()); refresh(); });
    expect(loadChanges).toHaveBeenCalledTimes(4);
  });

  it("refreshes visible siblings on notifications, reconnect and activation, but leaves disabled Chat alone", async () => {
    let receive!: (event: BackendRpcEvent) => void;
    const unsubscribe = vi.fn();
    vi.mocked(onBackendEvent).mockImplementation((listener) => { receive = listener; return unsubscribe; });
    const loadChanges = vi.fn(async () => changes());
    const { result, rerender, unmount } = renderHook(({ enabled }) => useSessionChanges({
      sessionId: "session-1", enabled, loadChanges,
    }), { initialProps: { enabled: true } });
    await act(async () => {});
    const event = (type: string, payload: Record<string, unknown>): BackendRpcEvent => ({ type: "event", event: {
      id: "hint", seq: 0, sessionId: "session-a", piSessionId: "pi-a", ts: "now", type, payload,
    } });
    await act(async () => receive(event("workspace.invalidated", { sessionIds: ["session-a", "session-1"] })));
    expect(loadChanges).toHaveBeenCalledTimes(2);
    await act(async () => receive(event("workspace.invalidated", { sessionIds: ["unrelated"] })));
    expect(loadChanges).toHaveBeenCalledTimes(2);
    await act(async () => receive(event("status", { lifecycle: "connected" })));
    expect(loadChanges).toHaveBeenCalledTimes(3);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(loadChanges).toHaveBeenCalledTimes(4);
    rerender({ enabled: false });
    await act(async () => {
      receive(event("status", { lifecycle: "connected" }));
      window.dispatchEvent(new Event("focus"));
      result.current.refresh();
    });
    expect(loadChanges).toHaveBeenCalledTimes(4);
    expect(unsubscribe).toHaveBeenCalled();
    unmount();
  });

  it("keeps the snapshot during background refresh and follows a dirty slow read without concurrency", async () => {
    const initial = changes({ head: { oid: "old", branch: "main", detached: false } });
    const gates: Array<(value: SessionChanges) => void> = [];
    const loadChanges = vi.fn(() => new Promise<SessionChanges>((resolve) => gates.push(resolve)));
    const { result } = renderHook(() => useSessionChanges({ sessionId: "session-1", loadChanges }));
    await act(async () => gates.shift()!(initial));
    act(() => result.current.refresh());
    await act(async () => {});
    expect(result.current.changes).toBe(initial);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
    act(() => { result.current.refresh(); result.current.refresh(); });
    await act(async () => {});
    expect(loadChanges).toHaveBeenCalledTimes(2);
    await act(async () => gates.shift()!(initial));
    expect(loadChanges).toHaveBeenCalledTimes(3);
    const fresh = changes({ head: { oid: "new", branch: "feature", detached: false } });
    await act(async () => gates.shift()!(fresh));
    expect(result.current.changes).toBe(fresh);
    expect(result.current.refreshing).toBe(false);
  });

  it("leaves Git alone until something is showing the diff", async () => {
    const loadChanges = vi.fn(async () => changes());
    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useSessionChanges({ sessionId: "session-1", enabled, loadChanges }),
      { initialProps: { enabled: false } },
    );

    expect(loadChanges).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);

    rerender({ enabled: true });

    // Loading has to be true on the very render that enables the read, or the
    // panel flashes its clean-tree copy before the request starts.
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.changes).not.toBeNull());
    expect(result.current.changes?.totals.files).toBe(2);

    rerender({ enabled: false });

    expect(result.current.changes).toBeNull();
    expect(loadChanges).toHaveBeenCalledTimes(1);
  });

  it("surfaces a load failure and reloads on refresh", async () => {
    const loadChanges = vi
      .fn()
      .mockRejectedValueOnce(new Error("Git is temporarily unavailable"))
      .mockResolvedValueOnce(changes());
    const { result } = renderHook(() =>
      useSessionChanges({ sessionId: "session-1", loadChanges }),
    );

    await waitFor(() =>
      expect(result.current.error).toBe("Git is temporarily unavailable"),
    );
    expect(result.current.changes).toBeNull();

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.changes).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it("checks out a branch and keeps the returned working tree", async () => {
    const loadChanges = vi.fn(async () =>
      changes({
        head: { oid: "aaa", branch: "main", detached: false },
        branches: ["main", "feat/composer-git"],
      }),
    );
    const checkoutSessionBranch = vi.fn(async () =>
      changes({
        head: { oid: "bbb", branch: "feat/composer-git", detached: false },
        branches: ["feat/composer-git", "main"],
      }),
    );
    const { result } = renderHook(() =>
      useSessionChanges({
        sessionId: "session-1",
        loadChanges,
        checkoutSessionBranch,
      }),
    );

    await waitFor(() => expect(result.current.changes?.head?.branch).toBe("main"));

    await act(() => result.current.checkoutBranch("feat/composer-git"));

    expect(checkoutSessionBranch).toHaveBeenCalledWith(
      "session-1",
      "feat/composer-git",
    );
    expect(result.current.changes?.head?.branch).toBe("feat/composer-git");
  });

  it("leaves the current branch in place when checkout fails", async () => {
    const loadChanges = vi.fn(async () =>
      changes({
        head: { oid: "aaa", branch: "main", detached: false },
        branches: ["main", "feat/composer-git"],
      }),
    );
    const checkoutSessionBranch = vi.fn(async () => {
      throw new Error("Please commit your changes or stash them before you switch branches.");
    });
    const { result } = renderHook(() =>
      useSessionChanges({
        sessionId: "session-1",
        loadChanges,
        checkoutSessionBranch,
      }),
    );

    await waitFor(() => expect(result.current.changes?.head?.branch).toBe("main"));

    await expect(
      result.current.checkoutBranch("feat/composer-git"),
    ).rejects.toThrow(/stash them before you switch/i);
    expect(result.current.changes?.head?.branch).toBe("main");
  });

  it("does not let a slower Git read overwrite a completed checkout", async () => {
    let resolveLoad!: (value: SessionChanges) => void;
    const loadChanges = vi.fn(
      () =>
        new Promise<SessionChanges>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const checkoutSessionBranch = vi.fn(async () =>
      changes({
        head: { oid: "bbb", branch: "feat/composer-git", detached: false },
        branches: ["feat/composer-git", "main"],
      }),
    );
    const { result } = renderHook(() =>
      useSessionChanges({
        sessionId: "session-1",
        loadChanges,
        checkoutSessionBranch,
      }),
    );

    expect(result.current.loading).toBe(true);

    await act(() => result.current.checkoutBranch("feat/composer-git"));
    expect(result.current.changes?.head?.branch).toBe("feat/composer-git");

    await act(async () => {
      resolveLoad(
        changes({
          head: { oid: "aaa", branch: "main", detached: false },
          branches: ["main", "feat/composer-git"],
        }),
      );
    });

    expect(result.current.changes?.head?.branch).toBe("feat/composer-git");
  });
});

describe("sessionChangesBadge", () => {
  it("counts the files the panel's totals row counts", () => {
    expect(sessionChangesBadge(changes())).toBe("2");
  });

  it("stays silent when there is no count to show", () => {
    expect(sessionChangesBadge(null)).toBeUndefined();
    expect(
      sessionChangesBadge(
        changes({ state: "clean", files: [], totals: emptyTotals }),
      ),
    ).toBeUndefined();
    expect(
      sessionChangesBadge(
        changes({ state: "non-git", files: [], totals: emptyTotals }),
      ),
    ).toBeUndefined();
    expect(
      sessionChangesBadge(changes({ files: [], totals: emptyTotals })),
    ).toBeUndefined();
  });
});
