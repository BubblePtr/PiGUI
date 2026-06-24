import { invoke as invokeTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

type InvokeArgs = Record<string, unknown>;

const emptyConfigInventory = {
  packages: [],
  extensions: [],
  skills: [],
  promptTemplates: [],
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}

function invokeBrowserFallback<T>(command: string): Promise<T> {
  switch (command) {
    case "list_sessions":
      return Promise.resolve([] as T);
    case "get_config_inventory":
      return Promise.resolve(emptyConfigInventory as T);
    default:
      return Promise.reject(
        new Error(`Tauri command "${command}" is unavailable outside the Tauri runtime.`),
      );
  }
}

export function invoke<T>(command: string, args?: InvokeArgs) {
  if (isTauriRuntime()) {
    return invokeTauri<T>(command, args);
  }

  return invokeBrowserFallback<T>(command);
}

export async function onWindowFocusChanged(refetch: () => unknown) {
  if (isTauriRuntime()) {
    return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        void refetch();
      }
    });
  }

  if (typeof window === "undefined") {
    return () => {};
  }

  const handleFocus = () => {
    void refetch();
  };

  window.addEventListener("focus", handleFocus);
  return () => {
    window.removeEventListener("focus", handleFocus);
  };
}
