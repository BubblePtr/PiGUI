import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaceRendererApi } from "@/shared/runtime";
import type { UpdateStatus } from "@/shared/update-protocol";
import { resetUpdateStatusStore, useUpdateStatus } from "./use-update-status";

const idleStatus: UpdateStatus = { state: "idle", currentVersion: "0.0.1" };
const readyStatus: UpdateStatus = {
  state: "ready",
  currentVersion: "0.0.1",
  availableVersion: "0.0.2",
};

function mockUpdateBridge(initial: UpdateStatus) {
  const listeners = new Set<(status: UpdateStatus) => void>();
  const invoke = vi.fn(async (command: string) => {
    if (command === "update:status") {
      return initial;
    }

    return null;
  });

  window.pace = {
    invoke: invoke as unknown as PaceRendererApi["invoke"],
    onBackendEvent: () => () => {},
    onBrowserEvent: () => () => {},
    onUpdateEvent: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onWindowFocusChanged: () => () => {},
    onNavigateRequest: () => () => {},
  };

  return {
    invoke,
    emit(status: UpdateStatus) {
      for (const listener of listeners) {
        listener(status);
      }
    },
  };
}

describe("useUpdateStatus store", () => {
  beforeEach(() => {
    resetUpdateStatusStore();
  });

  afterEach(() => {
    resetUpdateStatusStore();
    delete window.pace;
  });

  it("invokes once for two hook instances and they read the same status", async () => {
    const { invoke } = mockUpdateBridge(idleStatus);
    const { result: first } = renderHook(() => useUpdateStatus());
    const { result: second } = renderHook(() => useUpdateStatus());

    await waitFor(() => {
      expect(first.current).toEqual(idleStatus);
    });

    expect(second.current).toBe(first.current);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("update:status", undefined);
  });

  it("does not invoke again after remount and returns the cached status immediately", async () => {
    const { invoke } = mockUpdateBridge(idleStatus);
    const { result, unmount } = renderHook(() => useUpdateStatus());

    await waitFor(() => {
      expect(result.current).toEqual(idleStatus);
    });
    const cached = result.current;
    unmount();

    const { result: again } = renderHook(() => useUpdateStatus());

    expect(again.current).toBe(cached);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("pushes onUpdateEvent to every consumer", async () => {
    const bridge = mockUpdateBridge(idleStatus);
    const { result: first } = renderHook(() => useUpdateStatus());
    const { result: second } = renderHook(() => useUpdateStatus());

    await waitFor(() => {
      expect(first.current).toEqual(idleStatus);
    });

    act(() => {
      bridge.emit(readyStatus);
    });

    expect(first.current).toEqual(readyStatus);
    expect(second.current).toBe(first.current);
  });

  it("invokes again on the next mount after resetUpdateStatusStore", async () => {
    const { invoke } = mockUpdateBridge(idleStatus);
    const { unmount } = renderHook(() => useUpdateStatus());

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(1);
    });
    unmount();
    resetUpdateStatusStore();

    renderHook(() => useUpdateStatus());

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(2);
    });
  });
});
