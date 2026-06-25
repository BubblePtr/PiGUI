import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { SessionSummary } from "./sessions";
import type { SessionDetail } from "./session-detail";
import { invoke, isTauriRuntime, onWindowFocusChanged } from "./tauri-runtime";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => `tauri:${command}`),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    onFocusChanged: vi.fn(async () => vi.fn()),
  })),
}));

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

describe("tauri runtime bridge", () => {
  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it("detects whether Tauri internals are available", () => {
    expect(isTauriRuntime()).toBe(false);

    window.__TAURI_INTERNALS__ = {};

    expect(isTauriRuntime()).toBe(true);
  });

  it("returns browser development data outside Tauri", async () => {
    const sessions = await invoke<SessionSummary[]>("list_sessions");

    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions).toContainEqual(
      expect.objectContaining({
        timestamp: "2026-03-20T04:33:21.661Z",
        project: "excalidraw",
        totalCostUsd: expect.any(Number),
        totalTokens: expect.any(Number),
      }),
    );
    await expect(invoke("get_config_inventory")).resolves.toEqual({
      packages: [],
      extensions: [],
      skills: [],
      promptTemplates: [],
    });
    await expect(
      invoke<SessionDetail>("get_session_detail", { id: "dev-fixture-pig-jun24" }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "dev-fixture-pig-jun24",
        project: "Pig",
        turns: expect.arrayContaining([
          expect.objectContaining({
            kind: "message",
            parts: expect.arrayContaining([
              expect.objectContaining({
                partType: "text",
              }),
            ]),
          }),
        ]),
      }),
    );

    expect(tauriInvoke).not.toHaveBeenCalled();
  });

  it("delegates commands to Tauri when internals are available", async () => {
    window.__TAURI_INTERNALS__ = {};

    await expect(invoke("list_sessions")).resolves.toBe("tauri:list_sessions");

    expect(tauriInvoke).toHaveBeenCalledWith("list_sessions", undefined);
  });

  it("uses the browser focus event outside Tauri", async () => {
    const refetch = vi.fn();

    const unlisten = await onWindowFocusChanged(refetch);
    window.dispatchEvent(new FocusEvent("focus"));
    unlisten();
    window.dispatchEvent(new FocusEvent("focus"));

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(getCurrentWindow).not.toHaveBeenCalled();
  });

  it("uses the Tauri focus event when internals are available", async () => {
    window.__TAURI_INTERNALS__ = {};
    const refetch = vi.fn();
    const unlisten = vi.fn();
    const onFocusChanged = vi.fn(async (handler: (event: { payload: boolean }) => void) => {
      handler({ payload: true });
      handler({ payload: false });
      return unlisten;
    });
    vi.mocked(getCurrentWindow).mockReturnValue({
      onFocusChanged,
    } as unknown as ReturnType<typeof getCurrentWindow>);

    const result = await onWindowFocusChanged(refetch);
    result();

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
