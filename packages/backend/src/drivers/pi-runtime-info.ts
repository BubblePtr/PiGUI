declare const __PIGUI_APP_VERSION__: string;
declare const __PIGUI_PI_VERSION__: string;

export type PiRuntimeInfo = {
  appVersion: string;
  piVersion: string;
  mode: "SDK";
};

export async function inspectPiRuntime(): Promise<PiRuntimeInfo> {
  const sdk = await import("@earendil-works/pi-coding-agent");
  if (typeof sdk.createAgentSession !== "function" || typeof sdk.SessionManager?.create !== "function") {
    throw new Error("The bundled Pi SDK is missing its session APIs.");
  }

  // Bundling relocates Pi's package lookup to the App package.json. Capture
  // the installed engine version at build time instead of reporting App's version as Pi's.
  const piVersion = typeof __PIGUI_PI_VERSION__ === "string" ? __PIGUI_PI_VERSION__ : sdk.VERSION;
  if (!piVersion) {
    throw new Error("The bundled Pi SDK version could not be determined.");
  }
  return {
    appVersion: typeof __PIGUI_APP_VERSION__ === "string" ? __PIGUI_APP_VERSION__ : "development",
    piVersion,
    mode: "SDK",
  };
}
