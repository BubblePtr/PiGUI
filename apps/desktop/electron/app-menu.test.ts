import { describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "@/shared/update-protocol";
import { buildAppMenuTemplate, installAppMenu } from "./app-menu";

type MenuNode = {
  label?: string;
  role?: string;
  enabled?: boolean;
  click?: (...args: never[]) => void;
  submenu?: MenuNode[];
};

function createFakeUpdater(state: UpdateStatus["state"]) {
  return {
    getStatus: () => ({ state, currentVersion: "0.0.1" }),
    check: vi.fn(() => ({ state, currentVersion: "0.0.1" })),
  };
}

function findLabeledItem(nodes: MenuNode[], label: string): MenuNode | undefined {
  for (const node of nodes) {
    if (node.label === label) {
      return node;
    }

    if (node.submenu) {
      const found = findLabeledItem(node.submenu, label);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

describe("buildAppMenuTemplate", () => {
  it("inserts Check for Updates… after About on darwin and click checks then navigates", () => {
    const updater = createFakeUpdater("idle");
    const navigateToSettings = vi.fn();
    const template = buildAppMenuTemplate({
      platform: "darwin",
      updater,
      navigateToSettings,
    }) as MenuNode[];
    const appMenu = template.find((item) => item.role === "appMenu");
    const aboutIndex = appMenu?.submenu?.findIndex((item) => item.role === "about") ?? -1;
    const item = findLabeledItem(template, "Check for Updates…");

    expect(template.map((entry) => entry.role)).toEqual([
      "appMenu",
      "fileMenu",
      "editMenu",
      "viewMenu",
      "windowMenu",
    ]);
    expect(aboutIndex).toBeGreaterThanOrEqual(0);
    expect(appMenu?.submenu?.[aboutIndex + 1]).toEqual(
      expect.objectContaining({
        label: "Check for Updates…",
        enabled: true,
      }),
    );

    item?.click?.();

    expect(updater.check).toHaveBeenCalledOnce();
    expect(navigateToSettings).toHaveBeenCalledOnce();
    expect(updater.check.mock.invocationCallOrder[0]).toBeLessThan(
      navigateToSettings.mock.invocationCallOrder[0],
    );
  });

  it("disables Check for Updates… when the updater is disabled", () => {
    const template = buildAppMenuTemplate({
      platform: "darwin",
      updater: createFakeUpdater("disabled"),
      navigateToSettings: vi.fn(),
    }) as MenuNode[];

    expect(findLabeledItem(template, "Check for Updates…")?.enabled).toBe(false);
  });

  it("omits Check for Updates… off darwin", () => {
    const template = buildAppMenuTemplate({
      platform: "linux",
      updater: createFakeUpdater("idle"),
      navigateToSettings: vi.fn(),
    }) as MenuNode[];

    expect(findLabeledItem(template, "Check for Updates…")).toBeUndefined();
  });
});

describe("installAppMenu", () => {
  function createFakeMenu() {
    const built = { role: "built-menu" };
    return {
      built,
      buildFromTemplate: vi.fn((_template: unknown) => built),
      setApplicationMenu: vi.fn(),
    };
  }

  it("builds and sets the application menu on darwin", () => {
    const menu = createFakeMenu();

    installAppMenu({
      platform: "darwin",
      updater: createFakeUpdater("idle"),
      navigateToSettings: vi.fn(),
      menu,
    });

    expect(menu.buildFromTemplate).toHaveBeenCalledOnce();
    expect(menu.setApplicationMenu).toHaveBeenCalledOnce();
    expect(menu.setApplicationMenu).toHaveBeenCalledWith(menu.built);
    expect(
      findLabeledItem(menu.buildFromTemplate.mock.calls[0][0] as MenuNode[], "Check for Updates…"),
    ).toEqual(expect.objectContaining({ label: "Check for Updates…", enabled: true }));
  });

  it("does not touch Menu off darwin", () => {
    const menu = createFakeMenu();

    installAppMenu({
      platform: "linux",
      updater: createFakeUpdater("idle"),
      navigateToSettings: vi.fn(),
      menu,
    });

    expect(menu.buildFromTemplate).not.toHaveBeenCalled();
    expect(menu.setApplicationMenu).not.toHaveBeenCalled();
  });
});

