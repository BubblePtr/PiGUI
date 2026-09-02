import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeModelControls } from "@pigui/core";
import { ModelSelectorControl } from "@/shared/ui/model-selector/model-selector-control";
import { buildIntentTarget, UiIntentPicker } from "./ui-intent-picker";

// Named exactly like the real Ledger component so the region registry matches.
function PiTraceLedger() {
  return (
    <div data-testid="ledger">
      <button type="button">row</button>
    </div>
  );
}

function Fixture() {
  return (
    <div>
      <PiTraceLedger />
      <UiIntentPicker />
    </div>
  );
}

/**
 * jsdom does no hit testing, so `document.elementFromPoint` is unusable there.
 * Tests stub it and return the intended target; in the real app the glass
 * pane hides itself momentarily and elementFromPoint finds the element under
 * the cursor.
 */
function stubElementFromPoint() {
  const stub = vi.fn();
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: stub,
    writable: true,
  });
  return stub;
}

function arm() {
  fireEvent.click(screen.getByLabelText("Pick a UI element to copy its intent block"));
  return screen.getByTestId("ui-intent-picker-glass");
}

function armAndClick(target: Element) {
  const fromPoint = stubElementFromPoint();
  const glass = arm();

  fromPoint.mockReturnValue(target);
  fireEvent.pointerMove(glass, { clientX: 10, clientY: 10 });
  fireEvent.click(glass, { clientX: 10, clientY: 10 });
}

describe("buildIntentTarget", () => {
  it("resolves region, component definition site, and nearest testid", () => {
    render(<PiTraceLedger />);

    const target = buildIntentTarget(screen.getByRole("button", { name: "row" }));

    expect(target.region?.region.term).toBe("Ledger");
    expect(target.component?.name).toBe("PiTraceLedger");
    expect(target.component?.definition.file).toContain("ui-intent-picker.test");
    expect(target.testId).toBe("ledger");
  });

  it("skips design-system primitives (Astryx Button/Popover) for the headline", () => {
    const controls: RuntimeModelControls = {
      models: [
        {
          provider: "xai",
          modelId: "grok-4",
          name: "Grok 4",
          thinkingLevels: ["off", "medium", "high"],
        },
      ],
      selected: { provider: "xai", modelId: "grok-4", thinkingLevel: "high" },
    };
    render(
      <ModelSelectorControl controls={controls} isLocked={false} onChange={() => {}} />,
    );

    const target = buildIntentTarget(screen.getByTestId("model-thinking-trigger"));

    // Regression: the headline used to be the Astryx `Button` wrapper whose
    // usage site lives in an app file, hiding the actual app component.
    expect(target.component?.name).toBe("ModelSelectorControl");
    expect(target.component?.definition.file).toContain("model-selector-control.tsx");
  });
});

describe("UiIntentPicker", () => {
  it("captures a clicked element and shows its region and component", () => {
    render(<Fixture />);

    armAndClick(screen.getByRole("button", { name: "row" }));

    const panel = screen.getByTestId("ui-intent-picker-panel");
    expect(panel).toHaveTextContent("Ledger");
    expect(panel).toHaveTextContent("PiTraceLedger");
    expect(panel).toHaveTextContent("ledger");
  });

  it("copies the formatted intent block to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
      writable: true,
    });

    render(<Fixture />);
    armAndClick(screen.getByRole("button", { name: "row" }));
    fireEvent.click(screen.getByRole("button", { name: /Copy intent block/ }));

    await screen.findByText("Copied");
    expect(writeText).toHaveBeenCalledOnce();

    const block = writeText.mock.calls[0][0] as string;
    expect(block).toContain("- Region: `Ledger` — CONTEXT.md term \"**Ledger**:\"");
    expect(block).toContain("`PiTraceLedger`");
    expect(block).toContain("- Nearest data-testid: `ledger`");
    expect(block).toContain("Change I want:");
  });

  it("toggles armed mode with Cmd/Ctrl+Shift+X and backs out with Escape", () => {
    render(<Fixture />);

    fireEvent.keyDown(document.body, {
      code: "KeyX",
      key: "x",
      metaKey: true,
      shiftKey: true,
    });
    expect(screen.getByText(/Click any element to capture/)).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByText(/Click any element to capture/)).not.toBeInTheDocument();
  });

  it("intercepts pointer events on the glass pane so app handlers never fire", () => {
    const onAppClick = vi.fn();
    const onAppPointerMove = vi.fn();
    render(
      // Sibling, not parent: the picker mounts at the app root, so app
      // wrappers are never React ancestors of the glass pane.
      <div>
        <div onClick={onAppClick} onPointerMove={onAppPointerMove}>
          <button type="button">row</button>
        </div>
        <UiIntentPicker />
      </div>,
    );

    const fromPoint = stubElementFromPoint();
    const glass = arm();
    fromPoint.mockReturnValue(screen.getByRole("button", { name: "row" }));

    // The glass swallows hover and clicks — app tooltips/flyouts stay closed
    // and the picked element is resolved via elementFromPoint instead.
    fireEvent.pointerMove(glass, { clientX: 10, clientY: 10 });
    fireEvent.click(glass, { clientX: 10, clientY: 10 });

    expect(onAppPointerMove).not.toHaveBeenCalled();
    expect(onAppClick).not.toHaveBeenCalled();
    expect(screen.getByTestId("ui-intent-picker-panel")).toBeInTheDocument();
  });
});
