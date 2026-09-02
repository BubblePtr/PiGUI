import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionDetail } from "@/pages/session-detail";
import type { SessionSummary } from "@/entities/session/sessions";
import {
  invoke,
  isElectronRuntime,
  onWindowFocusChanged,
  revealProjectInFinder,
  type PiGUIRendererApi,
} from "@/shared/runtime";

describe("renderer runtime bridge", () => {
  afterEach(() => {
    delete window.pigui;
    vi.clearAllMocks();
  });

  it("detects the Electron preload API", () => {
    expect(isElectronRuntime()).toBe(false);

    window.pigui = {
      invoke: vi.fn(),
      onBackendEvent: vi.fn(),
      onBrowserEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    expect(isElectronRuntime()).toBe(true);
  });

  it("delegates invoke calls to Electron when preload is available", async () => {
    const electronInvoke = vi.fn(async (command: string) => `electron:${command}`);
    window.pigui = {
      invoke: electronInvoke as unknown as PiGUIRendererApi["invoke"],
      onBackendEvent: vi.fn(),
      onBrowserEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    await expect(invoke("list_sessions")).resolves.toBe("electron:list_sessions");

    expect(electronInvoke).toHaveBeenCalledWith("list_sessions", undefined);
  });

  it("reveals a Project in Finder through Electron when preload is available", async () => {
    const electronInvoke = vi.fn(async () => undefined);
    window.pigui = {
      invoke: electronInvoke as unknown as PiGUIRendererApi["invoke"],
      onBackendEvent: vi.fn(),
      onBrowserEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    await revealProjectInFinder("/Users/void/code/opensource/Pig");

    expect(electronInvoke).toHaveBeenCalledWith("reveal_project_in_finder", {
      path: "/Users/void/code/opensource/Pig",
    });
  });

  it("treats Reveal in Finder as a no-op outside Electron", async () => {
    await expect(revealProjectInFinder("/Users/void/code/opensource/Pig")).resolves.toBeUndefined();
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
    await expect(invoke("resolve_tool_schemas", { names: ["bash"] })).resolves.toEqual({
      schemas: {},
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
    window.pigui = {
      invoke: vi.fn(),
      onBackendEvent: vi.fn(),
      onBrowserEvent: vi.fn(),
      onWindowFocusChanged: onWindowFocusChangedPreload,
    };

    const result = await onWindowFocusChanged(refetch);
    result();

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("strips Electron's remote-method wrapper from invoke errors", async () => {
    // Electron re-throws a handler's error wrapped in its own channel prefix,
    // which would otherwise be read out verbatim in surface error states.
    window.pigui = {
      invoke: (() =>
        Promise.reject(
          new Error(
            "Error invoking remote method 'pigui:invoke': Error: The browser surface only opens http and https pages.",
          ),
        )) as unknown as PiGUIRendererApi["invoke"],
      onBackendEvent: vi.fn(),
      onBrowserEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    await expect(invoke("browser_navigate")).rejects.toThrowError(
      new Error("The browser surface only opens http and https pages."),
    );
  });

  it("leaves an error that carries no wrapper untouched", async () => {
    window.pigui = {
      invoke: (() =>
        Promise.reject(
          new Error("PiGUI backend utility process is not connected."),
        )) as unknown as PiGUIRendererApi["invoke"],
      onBackendEvent: vi.fn(),
      onBrowserEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    await expect(invoke("list_sessions")).rejects.toThrowError(
      new Error("PiGUI backend utility process is not connected."),
    );
  });
});
