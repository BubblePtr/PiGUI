import type { UpdateStatus } from "@/shared/update-protocol";

const firstCheckDelayMs = 10_000;
const checkIntervalMs = 4 * 60 * 60 * 1000;
const disabledReason = "Updates are only available in the packaged desktop app.";

export type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: unknown;
  checkForUpdates: () => unknown;
  quitAndInstall: () => unknown;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

export type AppUpdater = {
  getStatus: () => UpdateStatus;
  check: () => UpdateStatus;
  install: () => UpdateStatus;
  start: () => void;
  subscribe: (listener: (status: UpdateStatus) => void) => () => void;
};

export function createAppUpdater(options: {
  autoUpdater: AutoUpdaterLike;
  isPackaged: boolean;
  currentVersion: string;
  /** When set, the updater stays disabled even in a packaged app (E2E). */
  disabledReason?: string;
}): AppUpdater {
  const { autoUpdater, isPackaged, currentVersion } = options;
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  const offReason = options.disabledReason ?? (isPackaged ? undefined : disabledReason);
  let status: UpdateStatus = offReason
    ? { state: "disabled", currentVersion, reason: offReason }
    : { state: "idle", currentVersion };
  const listeners = new Set<(next: UpdateStatus) => void>();

  const emit = (next: UpdateStatus) => {
    status = next;
    for (const listener of listeners) {
      listener(status);
    }
  };

  autoUpdater.on("checking-for-update", () => {
    if (status.state === "disabled") return;
    emit({ state: "checking", currentVersion });
  });
  autoUpdater.on("update-available", (info: unknown) => {
    if (status.state === "disabled") return;
    emit({
      state: "available",
      currentVersion,
      availableVersion: versionOf(info) ?? status.availableVersion,
    });
  });
  autoUpdater.on("update-not-available", () => {
    if (status.state === "disabled") return;
    emit({ state: "idle", currentVersion });
  });
  autoUpdater.on("download-progress", (progress: unknown) => {
    if (status.state === "disabled") return;
    emit({
      state: "downloading",
      currentVersion,
      availableVersion: status.availableVersion,
      progressPercent: percentOf(progress),
    });
  });
  autoUpdater.on("update-downloaded", (info: unknown) => {
    if (status.state === "disabled") return;
    emit({
      state: "ready",
      currentVersion,
      availableVersion: versionOf(info) ?? status.availableVersion,
    });
  });
  autoUpdater.on("error", (error: unknown) => {
    if (status.state === "disabled") return;
    emit({
      state: "error",
      currentVersion,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  const check = () => {
    // A second check would drop availableVersion / progress / the ready
    // snapshot; the 4h interval and the settings button both call this.
    if (status.state !== "idle" && status.state !== "error") {
      return status;
    }

    emit({ state: "checking", currentVersion });
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      emit({
        state: "error",
        currentVersion,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return status;
  };

  return {
    getStatus: () => status,
    check,
    install() {
      if (status.state === "ready") {
        autoUpdater.quitAndInstall();
      }

      return status;
    },
    start() {
      if (status.state === "disabled") {
        return;
      }

      setTimeout(check, firstCheckDelayMs);
      setInterval(check, checkIntervalMs);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function versionOf(info: unknown) {
  if (typeof info === "object" && info !== null && "version" in info) {
    const version = (info as { version?: unknown }).version;
    return typeof version === "string" ? version : undefined;
  }

  return undefined;
}

function percentOf(progress: unknown) {
  if (typeof progress === "object" && progress !== null && "percent" in progress) {
    const percent = (progress as { percent?: unknown }).percent;
    return typeof percent === "number" ? percent : undefined;
  }

  return undefined;
}

