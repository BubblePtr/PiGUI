import { expect, test, type Page } from "@playwright/test";
import {
  assertNoFixtureData,
  launchPiGUI,
  type E2EProject,
  type E2ESessionProjection,
} from "../fixtures/electron-app";

declare global {
  interface Window {
    __piguiE2EBackendLifecycle?: Array<{
      generation: number;
      lifecycle: string;
    }>;
  }
}

async function openProjectDraft(window: Page, project: E2EProject) {
  const newSession = window.getByRole("row", { name: "New Session", exact: true });

  await expect(newSession).toBeVisible();
  await newSession.click();
  await expect(window.getByRole("textbox")).toBeVisible();
  await expect(window.getByText(project.displayName, { exact: true }).first()).toBeVisible();
}

async function openSession(
  window: Page,
  project: E2EProject,
  projection: E2ESessionProjection,
) {
  await openProjectDraft(window, project);

  const session = window.getByRole("row", {
    name: new RegExp(projection.initialPrompt, "i"),
  });

  await expect(session).toBeVisible();
  await session.click();
  await expect(window.getByLabel("Session changes")).toBeVisible();
  await expect(window.getByLabel("Session actions")).toBeVisible();
}

test.describe("M1: Real-data-only", () => {
  test("starts from an isolated fixture-free state", async () => {
    const testApp = await launchPiGUI();

    try {
      await expect(testApp.window).toHaveTitle(/PiGUI/);
      await expect(
        testApp.window.getByRole("button", { name: /add project/i }),
      ).toBeVisible();
      await assertNoFixtureData(testApp.window);
    } finally {
      await testApp.close();
    }
  });

  test("opens a real registered Project with an empty Session draft", async () => {
    const testApp = await launchPiGUI({ seedProject: true });

    try {
      await openProjectDraft(testApp.window, testApp.project!);
      await expect(testApp.window.getByText("No chats", { exact: true })).toBeVisible();
      await assertNoFixtureData(testApp.window);
    } finally {
      await testApp.close();
    }
  });
});

test.describe("M2: Reliable lifecycle", () => {
  test("archives a persisted Session through the real UI", async () => {
    const testApp = await launchPiGUI({ seedSession: true });

    try {
      await openSession(
        testApp.window,
        testApp.project!,
        testApp.projection!,
      );
      await testApp.window.getByLabel("Session actions").click();

      const archive = testApp.window.getByRole("button", {
        name: "Archive Session",
      });

      await expect(archive).toBeEnabled();
      await archive.click();
      await expect(testApp.window.getByText("This Session is archived.")).toBeVisible();
      await expect(archive).toBeDisabled();
      await expect.poll(async () => (await testApp.readProjection())?.status).toBe(
        "archived",
      );
      expect((await testApp.readProjection())?.archivedAt).toBeTruthy();
    } finally {
      await testApp.close();
    }
  });

  test("restarts the killed backend and reloads persisted projections", async () => {
    const testApp = await launchPiGUI({ seedSession: true });

    try {
      await openSession(
        testApp.window,
        testApp.project!,
        testApp.projection!,
      );
      await testApp.window.evaluate(() => {
        window.__piguiE2EBackendLifecycle = [];
        window.pigui!.onBackendEvent((event) => {
          if (event.event.sessionId !== "__backend__") {
            return;
          }

          window.__piguiE2EBackendLifecycle!.push({
            generation: Number(event.event.payload.generation),
            lifecycle: String(event.event.payload.lifecycle),
          });
        });
      });

      const reloadedProjection = {
        ...testApp.projection!,
        initialPrompt: "Reloaded after backend restart",
        updatedAt: "2026-07-19T00:02:00.000Z",
      };

      await testApp.writeProjection(reloadedProjection);
      const killedGeneration = await testApp.window.evaluate(() =>
        window.pigui!.invoke<{ generation: number }>("__e2e_kill_backend"),
      );

      await expect
        .poll(
          () =>
            testApp.window.evaluate(
              () => window.__piguiE2EBackendLifecycle ?? [],
            ),
          { timeout: 15_000 },
        )
        .toEqual([
          {
            generation: killedGeneration.generation,
            lifecycle: "disconnected",
          },
          {
            generation: killedGeneration.generation + 1,
            lifecycle: "connected",
          },
        ]);
      await expect(
        testApp.window.getByRole("row", {
          name: /Reloaded after backend restart/i,
        }),
      ).toBeVisible();
      await expect(testApp.window).toHaveTitle(/PiGUI/);
    } finally {
      await testApp.close();
    }
  });

});

test.describe("M3: Real diff action surface", () => {
  test("renders Git changes from the Session checkout", async () => {
    const testApp = await launchPiGUI({ seedGitChanges: true });

    try {
      await openSession(
        testApp.window,
        testApp.project!,
        testApp.projection!,
      );
      await testApp.window.getByLabel("Session changes").click();

      await expect(
        testApp.window.getByRole("dialog", { name: "Changes" }),
      ).toBeVisible();
      await expect(testApp.window.getByTestId("session-changes-aside")).toHaveCount(0);

      await expect(testApp.window.getByText("src/app.ts").first()).toBeVisible();
      await expect(
        testApp.window.getByText("src/new-feature.ts").first(),
      ).toBeVisible();
      await expect(testApp.window.getByText("+2").first()).toBeVisible();
      await expect(testApp.window.getByText("-1").first()).toBeVisible();
      await expect(
        testApp.window.getByText('export const state = "after";', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 15_000 });

      await testApp.resizeWindow(640, 780);

      const narrowSheetBox = await testApp.window
        .locator('[data-slot="sheet-content"]')
        .boundingBox();
      const narrowViewport = await testApp.window.evaluate(() => ({
        height: window.innerHeight,
        width: window.innerWidth,
      }));

      expect(narrowSheetBox).not.toBeNull();
      expect(narrowSheetBox!.x).toBeLessThanOrEqual(1);
      expect(narrowSheetBox!.width).toBeGreaterThanOrEqual(
        narrowViewport.width - 1,
      );
      expect(narrowSheetBox!.height).toBeGreaterThanOrEqual(
        narrowViewport.height - 1,
      );
    } finally {
      await testApp.close();
    }
  });

  test("docks Changes beside Chat in a wide Electron window", async () => {
    const testApp = await launchPiGUI({ seedGitChanges: true });

    try {
      await testApp.resizeWindow(1440, 900);
      await openSession(
        testApp.window,
        testApp.project!,
        testApp.projection!,
      );
      await testApp.window.getByLabel("Session changes").click();

      const changesAside = testApp.window.getByTestId("session-changes-aside");

      await expect(changesAside).toBeVisible();
      await expect(testApp.window.getByLabel("Live Chat messages")).toBeVisible();
      await expect(testApp.window.getByLabel("Resize Session changes")).toBeVisible();
      await expect(
        testApp.window.getByRole("dialog", { name: "Changes" }),
      ).toHaveCount(0);
      await expect(changesAside.getByText("src/app.ts").first()).toBeVisible();
      await expect(
        changesAside.getByText('export const state = "after";', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 15_000 });

      const resizeHandle = testApp.window.getByLabel("Resize Session changes");
      const handleBox = await resizeHandle.boundingBox();
      const initialAsideBox = await changesAside.boundingBox();

      expect(handleBox).not.toBeNull();
      expect(initialAsideBox).not.toBeNull();
      await testApp.window.mouse.move(
        handleBox!.x + handleBox!.width / 2,
        handleBox!.y + handleBox!.height / 2,
      );
      await testApp.window.mouse.down();
      await testApp.window.mouse.move(
        handleBox!.x + handleBox!.width / 2 - 80,
        handleBox!.y + handleBox!.height / 2,
        { steps: 5 },
      );
      await testApp.window.mouse.up();
      await expect
        .poll(async () => (await changesAside.boundingBox())?.width ?? 0)
        .toBeGreaterThan(initialAsideBox!.width + 40);

      const chatBox = await testApp.window.getByTestId("live-session-column").boundingBox();
      const asideBox = await changesAside.boundingBox();

      expect(chatBox).not.toBeNull();
      expect(asideBox).not.toBeNull();
      expect(asideBox!.x).toBeGreaterThanOrEqual(chatBox!.x + chatBox!.width);
    } finally {
      await testApp.close();
    }
  });
});
