import { createRequire } from "node:module";
import type { MenuItemConstructorOptions } from "electron";
import type { AppUpdater } from "./updater";

const requireElectron = createRequire(import.meta.url);

type AppMenuDependencies = {
  updater: Pick<AppUpdater, "getStatus" | "check">;
  navigateToSettings: () => void;
};

/**
 * Pure menu shape so unit tests can assert darwin vs other platforms without
 * loading Electron. `installAppMenu` is the only function that touches Menu.
 */
export function buildAppMenuTemplate({
  platform,
  updater,
  navigateToSettings,
}: AppMenuDependencies & { platform: NodeJS.Platform }): MenuItemConstructorOptions[] {
  if (platform !== "darwin") {
    return [];
  }

  return [
    {
      role: "appMenu",
      submenu: [
        { role: "about" },
        {
          label: "Check for Updates…",
          enabled: updater.getStatus().state !== "disabled",
          click: () => {
            updater.check();
            navigateToSettings();
          },
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ];
}

export function installAppMenu(options: AppMenuDependencies) {
  if (process.platform !== "darwin") {
    return;
  }

  const { Menu } = requireElectron("electron") as typeof import("electron");
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildAppMenuTemplate({
        ...options,
        platform: "darwin",
      }),
    ),
  );
}
