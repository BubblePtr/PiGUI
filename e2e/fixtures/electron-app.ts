import { _electron as electron, ElectronApplication, Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Launch the built PiGUI Electron app.
 *
 * Prerequisite: `bun run build` must have completed so that
 * `apps/desktop/out/main/main.js` exists.
 */
export async function launchPiGUI(): Promise<{
  app: ElectronApplication;
  window: Page;
}> {
  const app = await electron.launch({
    args: [path.join(REPO_ROOT, "apps/desktop/out/main/main.js")],
    // Pass Electron CLI flags to disable GPU for headless CI
    executablePath: undefined, // use bundled electron
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  return { app, window };
}

/**
 * Assert that the page does NOT contain any fixture / stub data.
 *
 * Checks for common fixture strings that indicate the app is showing
 * development sample data instead of real user data.
 */
export async function assertNoFixtureData(window: Page): Promise<void> {
  const fixtureStrings = [
    "fixtureWorkspace",
    "fixture-session",
    "test-session-",
    "sample-project",
  ];

  const bodyText = await window.textContent("body");
  for (const needle of fixtureStrings) {
    if (bodyText?.includes(needle)) {
      throw new Error(`Fixture data leak detected: found "${needle}" in page`);
    }
  }
}
