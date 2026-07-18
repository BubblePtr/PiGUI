import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  MessageChannelMain,
  shell,
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
let backendProcess: ReturnType<typeof utilityProcess.fork> | null = null;
let backendRestartTimer: ReturnType<typeof setTimeout> | null = null;
let backendRequestCounter = 0;
let backendGeneration = 0;
let backendRestartAttempt = 0;
let appQuitting = false;
const pendingRequests = new Map<string, PendingRequest>();
const backendRestartBaseDelayMs = 250;
const backendRestartMaxDelayMs = 5_000;
const e2eKillBackendCommand = "__e2e_kill_backend";

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
    mainWindow?.webContents.send("pigui:window-focus");
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
  backendGeneration += 1;
  const generation = backendGeneration;
  const backend = utilityProcess.fork(backendPath(), [], {
    stdio: "pipe",
  });
  const { port1, port2 } = new MessageChannelMain();

  backendProcess = backend;
  backendPort = port1;
  backend.postMessage({ type: "connect" }, [port2]);
  port1.on("message", ({ data }) => {
    if (generation !== backendGeneration) {
      return;
    }

    if (isBackendRpcEvent(data)) {
      mainWindow?.webContents.send("pigui:backend-event", data);
      return;
    }

    if (isBackendRpcResponse(data)) {
      backendRestartAttempt = 0;
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
  port1.start();
  sendBackendLifecycleEvent({
    generation,
    lifecycle: "connected",
    title: "Backend connected",
    body: "PiGUI backend utility process is connected.",
  });
  backend.on("exit", (code) => {
    if (generation !== backendGeneration) {
      return;
    }

    const error = new Error(`PiGUI backend utility process exited with code ${code}.`);

    backendProcess = null;
    port1.close();
    backendPort = null;
    for (const pending of pendingRequests.values()) {
      pending.reject(error);
    }
    pendingRequests.clear();
    sendBackendLifecycleEvent({
      generation,
      lifecycle: "disconnected",
      title: "Backend exited",
      body: error.message,
    });
    scheduleBackendRestart();
  });
}

function startBackendBridge() {
  try {
    createBackendBridge();
  } catch (error) {
    sendBackendLifecycleEvent({
      generation: backendGeneration,
      lifecycle: "disconnected",
      title: "Backend start failed",
      body: error instanceof Error ? error.message : String(error),
    });
    scheduleBackendRestart();
  }
}

function scheduleBackendRestart() {
  if (appQuitting || backendRestartTimer) {
    return;
  }

  const delay = Math.min(
    backendRestartBaseDelayMs * 2 ** backendRestartAttempt,
    backendRestartMaxDelayMs,
  );

  backendRestartAttempt += 1;
  backendRestartTimer = setTimeout(() => {
    backendRestartTimer = null;
    startBackendBridge();
  }, delay);
}

function sendBackendLifecycleEvent(input: {
  generation: number;
  lifecycle: "connected" | "disconnected";
  title: string;
  body: string;
}) {
  const connected = input.lifecycle === "connected";

  mainWindow?.webContents.send("pigui:backend-event", {
    type: "event",
    event: {
      id: `backend-${input.lifecycle}-${input.generation}`,
      seq: 0,
      sessionId: "__backend__",
      piSessionId: "__backend__",
      type: connected ? "status" : "error",
      ts: new Date().toISOString(),
      payload: {
        kind: connected ? "status" : "error",
        lifecycle: input.lifecycle,
        generation: input.generation,
        title: input.title,
        body: input.body,
      },
    },
  } satisfies BackendRpcEvent);
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

async function selectProjectDirectory() {
  const owner = mainWindow ?? BrowserWindow.getFocusedWindow();
  const result = owner
    ? await dialog.showOpenDialog(owner, {
        title: "Select Project",
        properties: ["openDirectory"],
      })
    : await dialog.showOpenDialog({
        title: "Select Project",
        properties: ["openDirectory"],
      });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

function revealProjectInFinder(args?: Record<string, unknown>) {
  const path = typeof args?.path === "string" ? args.path : "";

  if (!path) {
    throw new Error("Project path is required.");
  }

  shell.showItemInFolder(path);
}

function killBackendForEndToEndTest() {
  if (process.env.PIGUI_E2E !== "1") {
    throw new Error("The PiGUI E2E backend control is disabled.");
  }

  if (!backendProcess) {
    throw new Error("PiGUI backend utility process is not running.");
  }

  const generation = backendGeneration;

  backendProcess.kill();

  return { generation };
}

ipcMain.handle(
  "pigui:invoke",
  (_event, input: { command: string; args?: Record<string, unknown> }) => {
    if (input.command === e2eKillBackendCommand) {
      return killBackendForEndToEndTest();
    }

    if (input.command === "select_project_directory") {
      return selectProjectDirectory();
    }

    if (input.command === "reveal_project_in_finder") {
      return revealProjectInFinder(input.args);
    }

    return invokeBackend(input.command, input.args);
  },
);

app.whenReady().then(() => {
  startBackendBridge();
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

app.on("before-quit", () => {
  appQuitting = true;

  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }

  backendPort?.close();
  backendPort = null;
  backendProcess?.kill();
  backendProcess = null;
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
