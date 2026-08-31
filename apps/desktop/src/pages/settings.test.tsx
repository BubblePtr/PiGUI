import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage, settingsModelsSectionId } from "@/pages/settings";
import { getVisibleModels } from "@/entities/model/visible-models";
import type { PiGUIRendererApi } from "@/shared/runtime";

const providerAuthStatus = {
  agentDir: "/agent",
  authPath: "/agent/auth.json",
  configuredCount: 1,
  providers: [
    {
      id: "anthropic",
      label: "Anthropic",
      supportsApiKey: true,
      supportsOAuth: true,
      mode: "api_key",
      configured: true,
      keyHint: "…dev1",
    },
    {
      id: "xai",
      label: "Grok (xAI)",
      supportsApiKey: true,
      supportsOAuth: true,
      mode: "none",
      configured: false,
    },
  ],
};

const modelControls = {
  models: [
    {
      provider: "anthropic",
      modelId: "claude-sonnet-4",
      name: "Claude Sonnet 4",
      thinkingLevels: ["off", "high"],
    },
    {
      provider: "xai",
      modelId: "grok-4",
      name: "Grok 4",
      thinkingLevels: ["off", "high"],
    },
    {
      provider: "xai",
      modelId: "grok-4-fast",
      name: "Grok 4 Fast",
      thinkingLevels: ["off", "high"],
    },
  ],
  selected: {
    provider: "xai",
    modelId: "grok-4",
    thinkingLevel: "high",
  },
};

function renderSettings(path = "/settings") {
  window.pigui = {
    invoke: vi.fn(async (command: string) => {
      if (command === "list_provider_auth_status") {
        return providerAuthStatus;
      }

      if (command === "list_available_model_controls") {
        return modelControls;
      }

      throw new Error(`unexpected backend command ${command}`);
    }),
    onBackendEvent: vi.fn(() => vi.fn()),
    onWindowFocusChanged: vi.fn(() => vi.fn()),
  } as unknown as PiGUIRendererApi;

  const rootRoute = createRootRoute({ component: SettingsPage });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute,
  });

  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function findModelsSection() {
  return screen.findByRole("region", { name: "Models" });
}

describe("Settings — visible models", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lists the available models grouped by provider, all visible by default", async () => {
    renderSettings();

    const section = await findModelsSection();
    const groups = await within(section).findAllByRole("group");

    expect(groups).toHaveLength(2);
    expect(within(section).getByRole("group", { name: "Anthropic models" })).toBe(
      groups[0],
    );
    expect(within(section).getByRole("group", { name: "Grok (xAI) models" })).toBe(
      groups[1],
    );
    for (const name of ["Claude Sonnet 4", "Grok 4", "Grok 4 Fast"]) {
      expect(within(section).getByRole("checkbox", { name })).toBeChecked();
    }
  });

  it("persists the models left visible after unchecking one", async () => {
    const user = userEvent.setup();

    renderSettings();

    const section = await findModelsSection();

    await user.click(
      await within(section).findByRole("checkbox", { name: "Grok 4 Fast" }),
    );

    await waitFor(() => {
      expect(getVisibleModels()).toEqual([
        { provider: "anthropic", modelId: "claude-sonnet-4" },
        { provider: "xai", modelId: "grok-4" },
      ]);
    });
    expect(
      within(section).getByRole("checkbox", { name: "Grok 4 Fast" }),
    ).not.toBeChecked();
  });

  it("scrolls to the Models section when linked into it", async () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");

    renderSettings(`/settings#${settingsModelsSectionId}`);

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    expect(scrollIntoView.mock.instances[0]).toBe(
      document.getElementById(settingsModelsSectionId),
    );

    scrollIntoView.mockRestore();
  });
});
