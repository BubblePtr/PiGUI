import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionDetail } from "@/pages/session-detail";
import type { SessionSummary } from "@/entities/session/sessions";
import { invoke, isElectronRuntime, onWindowFocusChanged, type PigRendererApi } from "@/shared/runtime";

describe("renderer runtime bridge", () => {
  afterEach(() => {
    delete window.pig;
    vi.clearAllMocks();
  });

  it("detects the Electron preload API", () => {
    expect(isElectronRuntime()).toBe(false);

    window.pig = {
      invoke: vi.fn(),
      onBackendEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    expect(isElectronRuntime()).toBe(true);
  });

  it("delegates invoke calls to Electron when preload is available", async () => {
    const electronInvoke = vi.fn(async (command: string) => `electron:${command}`);
    window.pig = {
      invoke: electronInvoke as unknown as PigRendererApi["invoke"],
      onBackendEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    await expect(invoke("list_sessions")).resolves.toBe("electron:list_sessions");

    expect(electronInvoke).toHaveBeenCalledWith("list_sessions", undefined);
  });

  it("returns browser development data outside Electron", async () => {
    const sessions = await invoke<SessionSummary[]>("list_sessions");

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
        turns: expect.any(Array),
      }),
    );
  });

  it("uses browser focus events outside Electron", async () => {
    const refetch = vi.fn();

    const unlisten = await onWindowFocusChanged(refetch);
    window.dispatchEvent(new FocusEvent("focus"));
    unlisten();
    window.dispatchEvent(new FocusEvent("focus"));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("uses preload focus events inside Electron", async () => {
    const refetch = vi.fn();
    const unlisten = vi.fn();
    const onWindowFocusChangedPreload = vi.fn((handler: () => void) => {
      handler();
      return unlisten;
    });
    window.pig = {
      invoke: vi.fn(),
      onBackendEvent: vi.fn(),
      onWindowFocusChanged: onWindowFocusChangedPreload,
    };

    const result = await onWindowFocusChanged(refetch);
    result();

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
