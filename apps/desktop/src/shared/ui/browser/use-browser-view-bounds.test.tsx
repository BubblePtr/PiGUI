import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useBrowserViewBounds } from "@/shared/ui/browser/use-browser-view-bounds";

function Probe({ onRectChange }: { onRectChange: (rect: unknown) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useBrowserViewBounds(ref, onRectChange, true);

  return (
    <div data-testid="dock">
      <div data-testid="placeholder" ref={ref} />
    </div>
  );
}

describe("useBrowserViewBounds", () => {
  it("re-measures after an ancestor transition ends, since a transform moves the placeholder without resizing it", () => {
    const rects = [
      { left: 1405, top: 80, width: 516, height: 820 },
      { left: 880, top: 80, width: 516, height: 820 },
    ];
    let index = 0;
    const onRectChange = vi.fn();
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ ...rects[Math.min(index, 1)], right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect);

    try {
      const { getByTestId } = render(<Probe onRectChange={onRectChange} />);

      // First push happens while the dock is still at its enter start.
      expect(onRectChange).toHaveBeenLastCalledWith({ x: 1405, y: 80, width: 516, height: 820 });

      // The dock's translateX transition settles: same size, new origin.
      index = 1;
      act(() => {
        getByTestId("dock").dispatchEvent(new Event("transitionend", { bubbles: true }));
      });

      expect(onRectChange).toHaveBeenLastCalledWith({ x: 880, y: 80, width: 516, height: 820 });
    } finally {
      spy.mockRestore();
    }
  });
});
