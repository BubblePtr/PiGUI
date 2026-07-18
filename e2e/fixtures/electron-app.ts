import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const repositoryRoot = path.resolve(currentDirectory, "..", "..");
const projectRegistryStorageKey = "pigui.projectRegistry.v1";

export type E2EProject = {
  id: string;
  path: string;
  displayName: string;
  addedAt: string;
};

export type E2ESessionProjection = {
  sessionId: string;
  runtimeId: string;
  piSessionId: string;
  projectId: string;
  initialPrompt: string;
  cwd: string;
  status: "completed" | "archived";
  sessionFileMissing: true;
  archivedAt?: string;
  updatedAt: string;
};

export type PiGUITestApplication = {
  app: ElectronApplication;
  window: Page;
  project: E2EProject | null;
  projection: E2ESessionProjection | null;
  readProjection(): Promise<E2ESessionProjection | null>;
  writeProjection(projection: E2ESessionProjection): Promise<void>;
  close(): Promise<void>;
};

type LaunchPiGUIOptions = {
  seedProject?: boolean;
  seedSession?: boolean;
};

function stringEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function projectionFilePath(dataDirectory: string, sessionId: string) {
  return path.join(
    dataDirectory,
    "projections",
    `${encodeURIComponent(sessionId)}.json`,
  );
}

async function writeJson(pathname: string, value: unknown) {
  await mkdir(path.dirname(pathname), { recursive: true });
  await writeFile(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function launchPiGUI(
  options: LaunchPiGUIOptions = {},
): Promise<PiGUITestApplication> {
  const testRoot = await mkdtemp(path.join(tmpdir(), "pigui-e2e-"));
  const profileDirectory = path.join(testRoot, "profile");
  const dataDirectory = path.join(testRoot, "data");
  const agentDirectory = path.join(testRoot, "agent");
  const projectDirectory = path.join(testRoot, "project");
  const shouldSeedProject = options.seedProject || options.seedSession;
  const project: E2EProject | null = shouldSeedProject
    ? {
        id: projectDirectory,
        path: projectDirectory,
        displayName: "E2E Project",
        addedAt: "2026-07-19T00:00:00.000Z",
      }
    : null;
  const projection: E2ESessionProjection | null = options.seedSession && project
    ? {
        sessionId: "e2e-session",
        runtimeId: "e2e-runtime",
        piSessionId: "e2e-pi-session",
        projectId: project.id,
        initialPrompt: "E2E lifecycle session",
        cwd: project.path,
        status: "completed",
        sessionFileMissing: true,
        updatedAt: "2026-07-19T00:01:00.000Z",
      }
    : null;

  await Promise.all([
    mkdir(profileDirectory, { recursive: true }),
    mkdir(dataDirectory, { recursive: true }),
    mkdir(agentDirectory, { recursive: true }),
    mkdir(projectDirectory, { recursive: true }),
  ]);

  if (projection) {
    await writeJson(
      projectionFilePath(dataDirectory, projection.sessionId),
      projection,
    );
  }

  const app = await electron.launch({
    args: [
      path.join(repositoryRoot, "apps/desktop/out/main/main.js"),
      `--user-data-dir=${profileDirectory}`,
    ],
    env: {
      ...stringEnvironment(),
      PIGUI_DATA_DIR: dataDirectory,
      PIGUI_E2E: "1",
      PI_CODING_AGENT_DIR: agentDirectory,
    },
  });
  const window = await app.firstWindow();

  await window.waitForLoadState("domcontentloaded");

  if (project) {
    await window.evaluate(
      ({ key, value }) => {
        window.localStorage.setItem(key, JSON.stringify([value]));
      },
      { key: projectRegistryStorageKey, value: project },
    );
    await window.reload({ waitUntil: "domcontentloaded" });
  }

  let closed = false;

  return {
    app,
    window,
    project,
    projection,
    async readProjection() {
      if (!projection) {
        return null;
      }

      return JSON.parse(
        await readFile(
          projectionFilePath(dataDirectory, projection.sessionId),
          "utf8",
        ),
      ) as E2ESessionProjection;
    },
    async writeProjection(nextProjection) {
      await writeJson(
        projectionFilePath(dataDirectory, nextProjection.sessionId),
        nextProjection,
      );
    },
    async close() {
      if (closed) {
        return;
      }

      closed = true;
      await app.close().catch(() => undefined);
      await rm(testRoot, { recursive: true, force: true });
    },
  };
}

export async function assertNoFixtureData(window: Page): Promise<void> {
  const fixtureStrings = [
    "Usage evidence review",
    "Agent Workspace shell",
    "Archived checkout snapshot",
    "Trace boundary pass",
    "dev fixture:",
  ];
  const bodyText = await window.locator("body").innerText();

  for (const needle of fixtureStrings) {
    if (bodyText.includes(needle)) {
      throw new Error(`Fixture data leak detected: found "${needle}" in page`);
    }
  }
}
