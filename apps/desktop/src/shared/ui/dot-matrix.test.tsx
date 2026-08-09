import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DotMatrix } from "@/shared/ui/dot-matrix";

describe("DotMatrix", () => {
  it("renders a 4×4 dot grid as a labeled status indicator", () => {
    const { container } = render(<DotMatrix />);

    const root = container.querySelector('[data-slot="dot-matrix"]');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("role", "status");
    expect(root).toHaveAttribute("data-state", "loading");
    expect(container.querySelectorAll('[data-slot="dot-matrix-dot"]')).toHaveLength(16);
    // Screen readers get the label even though the dots are decorative.
    expect(root).toHaveTextContent("loading");
    expect(root?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts a custom accessible label and forwards span props", () => {
    const { container } = render(
      <DotMatrix className="size-8" data-testid="spinner" label="Streaming response" />,
    );

    const root = container.querySelector('[data-testid="spinner"]');
    expect(root).toHaveTextContent("Streaming response");
    expect(root).toHaveClass("size-8");
  });
});
