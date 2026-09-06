import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppUpdater } from "./updater";

function createFakeAutoUpdater() {
  const emitter = new EventEmitter();

  return {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    logger: null as unknown,
    checkForUpdates: vi.fn(() => Promise.resolve()),
    quitAndInstall: vi.fn(),
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
}

describe("createAppUpdater", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays disabled and ignores start, check, and install when the app is not packaged", () => {
    const autoUpdater = createFakeAutoUpdater();
    const updater = createAppUpdater({
      autoUpdater,
      isPackaged: false,
      currentVersion: "0.0.1",
    });

    expect(updater.getStatus()).toMatchObject({
      state: "disabled",
      currentVersion: "0.0.1",
    });
    expect(updater.getStatus().reason).toEqual(expect.any(String));

    vi.useFakeTimers();
    updater.start();
    updater.check();
    updater.install();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(updater.getStatus().state).toBe("disabled");
  });

  it("stays disabled when an explicit reason is provided even if the app is packaged", () => {
    const autoUpdater = createFakeAutoUpdater();
    const updater = createAppUpdater({
      autoUpdater,
      isPackaged: true,
      currentVersion: "0.0.1",
      disabledReason: "Updates are disabled during end-to-end tests.",
    });

    expect(updater.getStatus()).toEqual({
      state: "disabled",
      currentVersion: "0.0.1",
      reason: "Updates are disabled during end-to-end tests.",
    });

    vi.useFakeTimers();
    updater.start();
    updater.check();
    updater.install();
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(updater.getStatus().state).toBe("disabled");
  });

  it("walks idle → checking → available → downloading → ready from autoUpdater events", () => {
    const autoUpdater = createFakeAutoUpdater();
    const updater = createAppUpdater({
      autoUpdater,
      isPackaged: true,
      currentVersion: "0.0.1",
    });

    expect(updater.getStatus()).toEqual({
      state: "idle",
      currentVersion: "0.0.1",
    });

    updater.check();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.getStatus().state).toBe("checking");

    autoUpdater.emit("update-available", { version: "0.0.2" });
    expect(updater.getStatus()).toMatchObject({
      state: "available",
      currentVersion: "0.0.1",
      availableVersion: "0.0.2",
    });

    autoUpdater.emit("download-progress", { percent: 41.6 });
    expect(updater.getStatus()).toMatchObject({
      state: "downloading",
      availableVersion: "0.0.2",
      progressPercent: 41.6,
    });

    autoUpdater.emit("update-downloaded", { version: "0.0.2" });
    expect(updater.getStatus()).toMatchObject({
      state: "ready",
      availableVersion: "0.0.2",
    });
  });

  it("records an error from autoUpdater without installing", () => {
    const autoUpdater = createFakeAutoUpdater();
    const updater = createAppUpdater({
      autoUpdater,
      isPackaged: true,
      currentVersion: "0.0.1",
    });

    updater.check();
    autoUpdater.emit("error", new Error("download failed"));

    expect(updater.getStatus()).toMatchObject({
      state: "error",
      currentVersion: "0.0.1",
      message: "download failed",
    });
    updater.install();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("ignores a manual check while a check is already in flight", () => {
    const autoUpdater = createFakeAutoUpdater();
    const updater = createAppUpdater({
      autoUpdater,
      isPackaged: true,
      currentVersion: "0.0.1",
    });

    updater.check();
    updater.check();

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.getStatus().state).toBe("checking");
  });

  it("does not restart a check while an update is available, downloading, or ready", () => {
    const autoUpdater = createFakeAutoUpdater();
    const updater = createAppUpdater({
      autoUpdater,
      isPackaged: true,
      currentVersion: "0.0.1",
    });

    updater.check();
    autoUpdater.emit("update-available", { version: "0.0.2" });
    updater.check();

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.getStatus()).toMatchObject({
      state: "available",
      availableVersion: "0.0.2",
    });

    autoUpdater.emit("download-progress", { percent: 41.6 });
    updater.check();

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.getStatus()).toMatchObject({
      state: "downloading",
      availableVersion: "0.0.2",
      progressPercent: 41.6,
    });

    autoUpdater.emit("update-downloaded", { version: "0.0.2" });
    updater.check();

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.getStatus()).toMatchObject({
      state: "ready",
      availableVersion: "0.0.2",
    });
  });

  it("calls quitAndInstall only when an update is ready", () => {
    const autoUpdater = createFakeAutoUpdater();
    const updater = createAppUpdater({
      autoUpdater,
      isPackaged: true,
      currentVersion: "0.0.1",
    });

    updater.install();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    updater.check();
    autoUpdater.emit("update-downloaded", { version: "0.0.2" });
    updater.install();

    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
