import { contextBridge, ipcRenderer } from "electron";
import type { BackendRpcEvent } from "@pigui/backend";
import type { PiGUIRendererApi } from "@/shared/runtime";

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
