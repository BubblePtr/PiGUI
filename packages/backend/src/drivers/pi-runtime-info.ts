declare const __PACE_APP_VERSION__: string;
declare const __PACE_PI_VERSION__: string;

export type PiRuntimeInfo = {
  appVersion: string;
  piVersion: string;
  mode: "SDK";
};

export async function inspectPiRuntime(): Promise<PiRuntimeInfo> {
  const sdk = (await import("./pi-runtime")).piSdk;
  if (typeof sdk.createAgentSession !== "function" || typeof sdk.SessionManager?.create !== "function") {
    throw new Error("The bundled Pi SDK is missing its session APIs.");
  }

  // Check the loaded package against the engine validated by this build.
  const piVersion = sdk.VERSION;
  if (typeof __PACE_PI_VERSION__ === "string" && piVersion !== __PACE_PI_VERSION__) {
    throw new Error(`Pi runtime version mismatch: expected ${__PACE_PI_VERSION__}, loaded ${piVersion} at ${process.env.PACE_PI_RUNTIME_DIR}`);
  }
  if (!piVersion) {
    throw new Error("The bundled Pi SDK version could not be determined.");
  }
  return {
    appVersion: typeof __PACE_APP_VERSION__ === "string" ? __PACE_APP_VERSION__ : "development",
    piVersion,
    mode: "SDK",
  };
}
