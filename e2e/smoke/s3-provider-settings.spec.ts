import { expect, test } from "@playwright/test";
import {
  launchPiGUI,
  type E2EProject,
  type E2ESessionProjection,
} from "../fixtures/electron-app";

// Astryx renders the Settings tab set as <nav aria-label="Tabs"> + buttons,
// not role="tab". Scope through the nav so "Subscription" cannot also match
// the "Login with subscription" buttons on the cards below.
function settingsTab(window: import("@playwright/test").Page, name: string) {
  return window
    .getByRole("navigation", { name: "Tabs" })
    .getByRole("button", { name, exact: true });
}

// The sidebar row button's accessible name starts with the Session title
// ("<title> <relative time>"), while the hover-revealed menu button next to it
// reads "Session actions for <title>". Anchoring at the start keeps the row the
// only match without resorting to positional selectors.
function sessionRowButton(window: import("@playwright/test").Page, title: string) {
  return window.getByRole("button", { name: new RegExp(`^${title}`, "i") });
}

async function openProjectDraft(window: import("@playwright/test").Page, project: E2EProject) {
  const newSession = window.getByRole("button", { name: "New Session", exact: true });
  await expect(newSession).toBeVisible();
  await newSession.click();
  await expect(window.getByRole("textbox")).toBeVisible();
}

async function openSession(
  window: import("@playwright/test").Page,
  project: E2EProject,
  projection: E2ESessionProjection,
) {
  await openProjectDraft(window, project);
  const session = sessionRowButton(window, projection.initialPrompt);
  await expect(session).toBeVisible();
  await session.click();
  await expect(window.getByLabel("Session changes")).toBeVisible();
  await expect(window.getByLabel("Session actions", { exact: true })).toBeVisible();
}

test.describe("S3: Provider Settings (DF-002)", () => {
  test("Settings page shows Subscription/API Key tabs with provider cards", async () => {
    const testApp = await launchPiGUI({ seedPreflightAuth: true });

    try {
      // Navigate to Settings via the sidebar row
      await testApp.window.getByRole("button", { name: "Settings" }).click();
      await expect(testApp.window.getByText("Settings", { exact: true }).first()).toBeVisible();

      // Tab structure exists
      await expect(
        settingsTab(testApp.window, "Subscription"),
      ).toBeVisible();
      await expect(
        settingsTab(testApp.window, "API Key"),
      ).toBeVisible();

      // API Key tab: OpenAI / Anthropic / DeepSeek / Grok (xAI) cards + brand icons.
      // Brand icons are scoped to their card: the Models section below the tabs
      // renders the same provider-icon testid per model-visibility group.
      await settingsTab(testApp.window, "API Key").click();
      for (const provider of ["openai", "anthropic", "deepseek", "xai"]) {
        const card = testApp.window.getByTestId(`provider-api-key-${provider}`);
        await expect(card).toBeVisible();
        await expect(card.getByTestId(`provider-icon-${provider}`)).toBeVisible();
      }
      await expect(
        testApp.window.getByTestId("provider-api-key-openai-codex"),
      ).toHaveCount(0);

      // Subscription tab: ChatGPT/Codex + Anthropic + Grok (xAI)
      await settingsTab(testApp.window, "Subscription").click();
      for (const provider of ["openai-codex", "anthropic", "xai"]) {
        const card = testApp.window.getByTestId(`provider-subscription-${provider}`);
        await expect(card).toBeVisible();
        await expect(card.getByTestId(`provider-icon-${provider}`)).toBeVisible();
      }
      // OpenAI API key and DeepSeek have no subscription card
      await expect(
        testApp.window.getByTestId("provider-subscription-openai"),
      ).toHaveCount(0);
      await expect(
        testApp.window.getByTestId("provider-subscription-deepseek"),
      ).toHaveCount(0);
    } finally {
      await testApp.close();
    }
  });

  test("blocks session creation with no provider credentials and offers Settings CTA", async () => {
    const testApp = await launchPiGUI({
      seedProject: true,
      seedPreflightAuth: false,
    });

    try {
      // Open draft composer without any auth -> hard gate
      await testApp.window.getByRole("button", { name: "New Session", exact: true }).click();

      const gate = testApp.window.getByTestId("session-draft-no-models-gate");
      await expect(gate).toBeVisible();
      await expect(
        gate.getByText("No models available", { exact: true }),
      ).toBeVisible();

      // CTA navigates to Settings
      await gate.getByRole("button", { name: /Open Provider Settings/i }).click();
      await expect(testApp.window.getByText("Settings", { exact: true }).first()).toBeVisible();
      await expect(
        settingsTab(testApp.window, "API Key"),
      ).toBeVisible();
    } finally {
      await testApp.close();
    }
  });

  test("preflight model_auth failure shows Configure providers CTA to Settings", async () => {
    const testApp = await launchPiGUI({
      requirePreflight: true,
      seedPreflightAuth: false,
    });

    try {
      await expect(testApp.window.getByText("Before your first session")).toBeVisible();
      await expect(
        testApp.window.getByText(/No provider credentials/i).first(),
      ).toBeVisible({ timeout: 30_000 });

      // Continue is disabled while auth missing
      await expect(
        testApp.window.getByRole("button", { name: /Continue/i }),
      ).toBeDisabled();

      // CTA jumps to Settings provider page
      await testApp.window.getByRole("button", { name: /Configure providers/i }).click();
      await expect(testApp.window.getByText("Settings", { exact: true }).first()).toBeVisible();
      await expect(
        settingsTab(testApp.window, "API Key"),
      ).toBeVisible();
    } finally {
      await testApp.close();
    }
  });

  test("after provider auth is configured, session creation exposes models", async () => {
    const testApp = await launchPiGUI({
      seedModelControls: true,
      seedPreflightAuth: true,
    });

    try {
      // Draft composer (no session selected) must NOT show the no-models gate
      await testApp.window.getByRole("button", { name: "New Session", exact: true }).click();
      await expect(testApp.window.getByTestId("session-draft-no-models-gate")).toHaveCount(0);

      // Open the seeded session: model/thinking trigger is available with models
      await openSession(
        testApp.window,
        testApp.project!,
        testApp.projection!,
      );

      const trigger = testApp.window.getByTestId("model-thinking-trigger");
      await expect(trigger).toBeVisible();

      // Popover lists at least one model
      await trigger.click();
      await expect(testApp.window.getByTestId("model-thinking-popover")).toBeVisible();
      const modelItems = testApp.window
        .getByTestId("model-thinking-model-list")
        .getByRole("listitem");
      await expect(modelItems.first()).toBeVisible();
      const count = await modelItems.count();
      expect(count).toBeGreaterThanOrEqual(1);
    } finally {
      await testApp.close();
    }
  });
});
