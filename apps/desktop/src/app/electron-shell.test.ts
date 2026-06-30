import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Electron shell", () => {
  it("keeps main thin and runs backend work in a utility process", () => {
    const main = readProjectFile("apps/desktop/electron/main.ts");

    expect(main).toContain("utilityProcess.fork");
    expect(main).toContain("MessageChannelMain");
    expect(main).toContain("ipcMain.handle");
    expect(main).toContain('"pigui:invoke"');
    expect(main).not.toContain('"pig:invoke"');
    expect(main).not.toContain('"pig:backend-event"');
    expect(main).not.toContain('"pig:window-focus"');
    expect(main).not.toContain("createBackendService");
    expect(main).not.toContain("buildSessionIndex");
    expect(main).not.toContain("spawn(");
  });

  it("uses secure BrowserWindow defaults for the renderer", () => {
    const main = readProjectFile("apps/desktop/electron/main.ts");

    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("sandbox: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain('titleBarStyle: "hidden"');
    expect(main).toContain("trafficLightPosition: { x: 16, y: 13 }");
  });

  it("exposes only a typed PiGUI API from preload", () => {
    const preload = readProjectFile("apps/desktop/electron/preload.ts");

    expect(preload).toContain('contextBridge.exposeInMainWorld("pigui"');
    expect(preload).toContain('ipcRenderer.invoke("pigui:invoke"');
    expect(preload).toContain('ipcRenderer.on("pigui:backend-event"');
    expect(preload).toContain('ipcRenderer.on("pigui:window-focus"');
    expect(preload).not.toContain('contextBridge.exposeInMainWorld("pig",');
    expect(preload).not.toContain('ipcRenderer.invoke("pig:invoke"');
    expect(preload).not.toContain('ipcRenderer.on("pig:backend-event"');
    expect(preload).not.toContain('ipcRenderer.on("pig:window-focus"');
    expect(preload).not.toContain("window.ipcRenderer");
  });

  it("opens a native directory picker for manual Project selection", () => {
    const main = readProjectFile("apps/desktop/electron/main.ts");

    expect(main).toContain("dialog.showOpenDialog");
    expect(main).toContain('input.command === "select_project_directory"');
    expect(main).toContain('title: "Select Project"');
    expect(main).toContain('properties: ["openDirectory"]');
  });

  it("reveals Projects in Finder through the main process", () => {
    const main = readProjectFile("apps/desktop/electron/main.ts");

    expect(main).toContain('import { join } from "node:path";');
    expect(main).toContain("shell.showItemInFolder");
    expect(main).toContain('input.command === "reveal_project_in_finder"');
  });

  it("hosts the backend service inside the utility process entrypoint", () => {
    const backend = readProjectFile("apps/desktop/electron/backend.ts");

    expect(backend).toContain("createBackendService");
    expect(backend).toContain('import type { MessagePortMain } from "electron"');
    expect(backend).toContain("const { parentPort } = process");
    expect(backend).toContain("parentPort");
    expect(backend).toContain('event.data?.type === "connect"');
    expect(backend).not.toMatch(/^import (?!type\b).*from ["']electron["'];/m);
  });

  it("rejects renderer invokes after the backend utility process exits", () => {
    const main = readProjectFile("apps/desktop/electron/main.ts");

    expect(main).toContain("backendPort = null");
    expect(main).toContain("backendPort?.close()");
    expect(main).toContain("PiGUI backend utility process is not connected.");
  });
});
