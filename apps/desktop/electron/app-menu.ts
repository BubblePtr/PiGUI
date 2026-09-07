import type { MenuItemConstructorOptions } from "electron";
import type { AppUpdater } from "./updater";

type AppMenuTemplateDependencies = {
  updater: Pick<AppUpdater, "getStatus" | "check">;
  navigateToSettings: () => void;
};

type AppMenuApi<TMenu> = {
  buildFromTemplate: (template: MenuItemConstructorOptions[]) => TMenu;
  setApplicationMenu: (menu: TMenu) => void;
};

type AppMenuDependencies<TMenu> = AppMenuTemplateDependencies & {
  menu: AppMenuApi<TMenu>;
  platform?: NodeJS.Platform;
};

/**
 * Pure menu shape so unit tests can assert darwin vs other platforms without
 * loading Electron. `installAppMenu` is the only function that touches Menu.
 */
export function buildAppMenuTemplate({
  platform,
  updater,
  navigateToSettings,
}: AppMenuTemplateDependencies & { platform: NodeJS.Platform }): MenuItemConstructorOptions[] {
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

export function installAppMenu<TMenu>(options: AppMenuDependencies<TMenu>) {
  const { menu, platform = process.platform, ...templateOptions } = options;
  const template = buildAppMenuTemplate({
    ...templateOptions,
    platform,
  });

  if (template.length === 0) {
    return;
  }

  menu.setApplicationMenu(menu.buildFromTemplate(template));
}
