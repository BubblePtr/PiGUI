/**
 * Wire contract for in-app updates.
 *
 * Main owns the electron-updater client; preload and the renderer share only
 * this serializable status and the push channel, never electron-updater itself.
 */

export type UpdateState =
  | "disabled"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export type UpdateStatus = {
  state: UpdateState;
  currentVersion: string;
  availableVersion?: string;
  progressPercent?: number;
  reason?: string;
  message?: string;
};

export const updateEventChannel = "pigui:update-event";
