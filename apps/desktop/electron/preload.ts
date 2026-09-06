import { contextBridge, ipcRenderer } from "electron";
import type { BackendRpcEvent } from "@pigui/backend";
import { browserEventChannel, type BrowserEvent } from "@/shared/browser-protocol";
import type { PiGUIRendererApi } from "@/shared/runtime";
import { updateEventChannel, type UpdateStatus } from "@/shared/update-protocol";

const api: PiGUIRendererApi = {
  invoke(command, args) {
    return ipcRenderer.invoke("pigui:invoke", { command, args });
  },

  onBackendEvent(listener: (event: BackendRpcEvent) => void) {
    const handler = (_event: Electron.IpcRendererEvent, event: BackendRpcEvent) => {
      listener(event);
    };

    ipcRenderer.on("pigui:backend-event", handler);
    return () => {
      ipcRenderer.removeListener("pigui:backend-event", handler);
    };
  },

  onBrowserEvent(listener: (event: BrowserEvent) => void) {
    const handler = (_event: Electron.IpcRendererEvent, event: BrowserEvent) => {
      listener(event);
    };

    ipcRenderer.on(browserEventChannel, handler);
    return () => {
      ipcRenderer.removeListener(browserEventChannel, handler);
    };
  },

  onUpdateEvent(listener: (event: UpdateStatus) => void) {
    const handler = (_event: Electron.IpcRendererEvent, event: UpdateStatus) => {
      listener(event);
    };

    ipcRenderer.on(updateEventChannel, handler);
    return () => {
      ipcRenderer.removeListener(updateEventChannel, handler);
    };
  },

  onWindowFocusChanged(listener) {
    const handler = () => {
      listener();
    };

    ipcRenderer.on("pigui:window-focus", handler);
    return () => {
      ipcRenderer.removeListener("pigui:window-focus", handler);
    };
  },
};

contextBridge.exposeInMainWorld("pigui", api);

function markMacVibrancyDocument() {
  if (process.platform === "darwin") {
    // HTTP dev pages can run preload before the HTML root is parsed.
    document.documentElement?.setAttribute("data-pigui-vibrancy", "");
  }
}

markMacVibrancyDocument();
window.addEventListener("DOMContentLoaded", markMacVibrancyDocument, { once: true });
