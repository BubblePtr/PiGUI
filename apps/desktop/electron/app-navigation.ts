import {
  navigateRequestChannel,
  type NavigateRequest,
} from "@/shared/navigate-protocol";

export type NavigableWindow = {
  isDestroyed: () => boolean;
  show: () => void;
  focus: () => void;
  webContents: {
    isLoadingMainFrame: () => boolean;
    send: (channel: string, payload: NavigateRequest) => void;
    once: (event: "did-finish-load", listener: () => void) => void;
  };
};

export type AppNavigationDependencies = {
  getWindow: () => NavigableWindow | null;
  createWindow: () => NavigableWindow;
};

/**
 * Bring the app window forward (creating it after a macOS close) and ask the
 * renderer to navigate. Injected window so this module never loads Electron.
 */
export function navigateAppWindow(
  { getWindow, createWindow }: AppNavigationDependencies,
  request: NavigateRequest,
) {
  let appWindow = getWindow();
  if (!appWindow || appWindow.isDestroyed()) {
    appWindow = createWindow();
  } else {
    appWindow.show();
    appWindow.focus();
  }

  const send = () => {
    if (!appWindow.isDestroyed()) {
      appWindow.webContents.send(navigateRequestChannel, request);
    }
  };

  if (appWindow.webContents.isLoadingMainFrame()) {
    appWindow.webContents.once("did-finish-load", send);
    return;
  }

  send();
}
