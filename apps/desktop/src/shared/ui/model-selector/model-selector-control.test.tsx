import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeModelControls } from "@pigui/core";
import { ModelSelectorControl } from "@/shared/ui/model-selector/model-selector-control";

const controls: RuntimeModelControls = {
  models: [
    {
      provider: "anthropic",
      modelId: "claude-sonnet-4",
      name: "Claude Sonnet 4",
      thinkingLevels: ["off", "low", "medium", "high"],
    },
    {
      provider: "xai",
      modelId: "grok-4",
      name: "Grok 4",
      thinkingLevels: ["off", "medium", "high"],
    },
    {
      provider: "moonshot",
      modelId: "kimi-k3",
      name: "Kimi K3",
      thinkingLevels: ["off"],
    },
  ],
  selected: {
    provider: "xai",
    modelId: "grok-4",
    thinkingLevel: "high",
  },
};

async function openSelector() {
  const user = userEvent.setup();

  await user.click(screen.getByTestId("model-thinking-trigger"));

  return {
    user,
    list: await screen.findByTestId("model-thinking-model-list"),
  };
}

describe("ModelSelectorControl visibility", () => {
  it("lists the whole catalog when no visibility is configured", async () => {
    render(
      <ModelSelectorControl
        controls={controls}
        isLocked={false}
        onChange={() => {}}
      />,
    );

    const { list } = await openSelector();

    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("hides models left out of the visible set", async () => {
    render(
      <ModelSelectorControl
        controls={controls}
        isLocked={false}
        visibleModels={[
          { provider: "anthropic", modelId: "claude-sonnet-4" },
          { provider: "xai", modelId: "grok-4" },
        ]}
        onChange={() => {}}
      />,
    );

    const { list } = await openSelector();

    expect(within(list).getByText("Claude Sonnet 4")).toBeInTheDocument();
    expect(within(list).queryByText("Kimi K3")).not.toBeInTheDocument();
  });

  it("keeps a hidden current selection listed and marks it", async () => {
    render(
      <ModelSelectorControl
        controls={controls}
        isLocked={false}
        visibleModels={[{ provider: "anthropic", modelId: "claude-sonnet-4" }]}
        onChange={() => {}}
      />,
    );

    const { list } = await openSelector();
    const rows = within(list).getAllByRole("listitem");

    expect(rows).toHaveLength(2);
    expect(within(list).getByText("Grok 4")).toBeInTheDocument();
    expect(within(list).getByText("Hidden in Settings")).toBeInTheDocument();
  });

  it("opens model management from the Add Models row", async () => {
    const onManageModels = vi.fn();

    render(
      <ModelSelectorControl
        controls={controls}
        isLocked={false}
        onChange={() => {}}
        onManageModels={onManageModels}
      />,
    );

    const { user } = await openSelector();

    await user.click(screen.getByText("Add Models"));

    expect(onManageModels).toHaveBeenCalledTimes(1);
  });
});
