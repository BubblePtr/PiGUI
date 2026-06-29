import {
  app,
  BrowserWindow,
  ipcMain,
  MessageChannelMain,
  type MessagePortMain,
  utilityProcess,
} from "electron";
import { join } from "node:path";
import type { BackendRpcEvent, BackendRpcResponse } from "@pigui/backend";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let mainWindow: BrowserWindow | null = null;
let backendPort: MessagePortMain | null = null;
let backendRequestCounter = 0;
const pendingRequests = new Map<string, PendingRequest>();

function rendererUrl() {
  return process.env.ELECTRON_RENDERER_URL;
}

function preloadPath() {
  return join(__dirname, "../preload/preload.js");
}

function backendPath() {
  return join(__dirname, "backend.js");
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: "PiGUI",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 13 },
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("focus", () => {
    mainWindow?.webContents.send("pig:window-focus");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (rendererUrl()) {
    void mainWindow.loadURL(rendererUrl()!);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function createBackendBridge() {
  const backend = utilityProcess.fork(backendPath(), [], {
    stdio: "pipe",
  });
  const { port1, port2 } = new MessageChannelMain();

  backendPort = port1;
  backend.postMessage({ type: "connect" }, [port2]);
  backendPort.on("message", ({ data }) => {
    if (isBackendRpcEvent(data)) {
      mainWindow?.webContents.send("pig:backend-event", data);
      return;
    }

    if (isBackendRpcResponse(data)) {
      const pending = pendingRequests.get(data.id);
      if (!pending) {
        return;
      }

      pendingRequests.delete(data.id);
      if (data.error) {
        pending.reject(new Error(data.error));
      } else {
        pending.resolve(data.result);
      }
    }
  });
  backendPort.start();
  backend.on("exit", (code) => {
    const error = new Error(`PiGUI backend utility process exited with code ${code}.`);

    backendPort?.close();
    backendPort = null;
    for (const pending of pendingRequests.values()) {
      pending.reject(error);
    }
    pendingRequests.clear();
    mainWindow?.webContents.send("pig:backend-event", {
      type: "event",
      event: {
        type: "error",
        error: error.message,
      },
    } satisfies BackendRpcEvent);
  });
}

function invokeBackend(command: string, args?: Record<string, unknown>) {
  if (!backendPort) {
    return Promise.reject(new Error("PiGUI backend utility process is not connected."));
  }

  backendRequestCounter += 1;
  const id = `renderer-${backendRequestCounter}`;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    backendPort!.postMessage({
      id,
      method: command,
      params: args,
    });
  });
}

ipcMain.handle(
  "pig:invoke",
  (_event, input: { command: string; args?: Record<string, unknown> }) =>
    invokeBackend(input.command, input.args),
);

app.whenReady().then(() => {
  createBackendBridge();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function isBackendRpcEvent(value: unknown): value is BackendRpcEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type?: unknown }).type === "event"
  );
}

function isBackendRpcResponse(value: unknown): value is BackendRpcResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string" &&
    ("result" in value || "error" in value)
  );
}
