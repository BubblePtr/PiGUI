import { contextBridge, ipcRenderer } from "electron";
import type { BackendRpcEvent } from "@pig/backend";
import type { PigRendererApi } from "@/shared/runtime";

const api: PigRendererApi = {
  invoke(command, args) {
    return ipcRenderer.invoke("pig:invoke", { command, args });
  },

  onBackendEvent(listener: (event: BackendRpcEvent) => void) {
    const handler = (_event: Electron.IpcRendererEvent, event: BackendRpcEvent) => {
      listener(event);
    };

    ipcRenderer.on("pig:backend-event", handler);
    return () => {
      ipcRenderer.removeListener("pig:backend-event", handler);
    };
  },

  onWindowFocusChanged(listener) {
    const handler = () => {
      listener();
    };

    ipcRenderer.on("pig:window-focus", handler);
    return () => {
      ipcRenderer.removeListener("pig:window-focus", handler);
    };
  },
};

contextBridge.exposeInMainWorld("pig", api);
