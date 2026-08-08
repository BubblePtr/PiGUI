import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextShimmer } from "@/shared/ui/chat/text-shimmer";

describe("TextShimmer", () => {
  it("renders its text with the shimmer slot and class", () => {
    render(<TextShimmer>PiGUI</TextShimmer>);

    const shimmer = screen.getByText("PiGUI");

    expect(shimmer).toHaveAttribute("data-slot", "text-shimmer");
    expect(shimmer).toHaveClass("text-shimmer");
  });

  it("appends caller class names", () => {
    render(<TextShimmer className="custom">Loading</TextShimmer>);

    expect(screen.getByText("Loading")).toHaveClass("text-shimmer", "custom");
  });
});
