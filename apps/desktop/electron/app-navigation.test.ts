import { describe, expect, it, vi } from "vitest";
import { navigateAppWindow, type NavigableWindow } from "./app-navigation";
import { navigateRequestChannel } from "@/shared/navigate-protocol";

function createFakeWindow({
  destroyed = false,
  loading = false,
}: {
  destroyed?: boolean;
  loading?: boolean;
} = {}) {
  const loadListeners: Array<() => void> = [];
  const window: NavigableWindow & { finishLoad: () => void } = {
    isDestroyed: () => destroyed,
    show: vi.fn(),
    focus: vi.fn(),
    webContents: {
      isLoadingMainFrame: () => loading,
      send: vi.fn(),
      once(event: "did-finish-load", listener: () => void) {
        if (event === "did-finish-load") {
          loadListeners.push(listener);
        }
      },
    },
    finishLoad() {
      loading = false;
      for (const listener of loadListeners.splice(0)) {
        listener();
      }
    },
  };

  return window;
}

describe("navigateAppWindow", () => {
  it("creates a window when none exists and waits for did-finish-load before sending", () => {
    const created = createFakeWindow({ loading: true });
    const createWindow = vi.fn(() => created);

    navigateAppWindow(
      {
        getWindow: () => null,
        createWindow,
      },
      { to: "/settings" },
    );

    expect(createWindow).toHaveBeenCalledOnce();
    expect(created.show).not.toHaveBeenCalled();
    expect(created.focus).not.toHaveBeenCalled();
    expect(created.webContents.send).not.toHaveBeenCalled();

    created.finishLoad();

    expect(created.webContents.send).toHaveBeenCalledOnce();
    expect(created.webContents.send).toHaveBeenCalledWith(navigateRequestChannel, {
      to: "/settings",
    });
  });

  it("creates a window when the current one is destroyed", () => {
    const destroyed = createFakeWindow({ destroyed: true });
    const created = createFakeWindow({ loading: false });

    navigateAppWindow(
      {
        getWindow: () => destroyed,
        createWindow: () => created,
      },
      { to: "/settings" },
    );

    expect(destroyed.show).not.toHaveBeenCalled();
    expect(destroyed.focus).not.toHaveBeenCalled();
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(created.webContents.send).toHaveBeenCalledWith("pigui:navigate", {
      to: "/settings",
    });
  });

  it("shows and focuses an existing window and sends immediately when the frame is loaded", () => {
    const existing = createFakeWindow({ loading: false });
    const createWindow = vi.fn(() => createFakeWindow());

    navigateAppWindow(
      {
        getWindow: () => existing,
        createWindow,
      },
      { to: "/settings" },
    );

    expect(createWindow).not.toHaveBeenCalled();
    expect(existing.show).toHaveBeenCalledOnce();
    expect(existing.focus).toHaveBeenCalledOnce();
    expect(existing.webContents.send).toHaveBeenCalledWith("pigui:navigate", {
      to: "/settings",
    });
  });

  it("shows and focuses an existing window but waits if the main frame is still loading", () => {
    const existing = createFakeWindow({ loading: true });

    navigateAppWindow(
      {
        getWindow: () => existing,
        createWindow: () => createFakeWindow(),
      },
      { to: "/settings" },
    );

    expect(existing.show).toHaveBeenCalledOnce();
    expect(existing.focus).toHaveBeenCalledOnce();
    expect(existing.webContents.send).not.toHaveBeenCalled();

    existing.finishLoad();

    expect(existing.webContents.send).toHaveBeenCalledWith("pigui:navigate", {
      to: "/settings",
    });
  });
});
