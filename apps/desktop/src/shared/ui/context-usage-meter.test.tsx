import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextUsageMeter } from "@/shared/ui/context-usage-meter";

describe("ContextUsageMeter", () => {
  it("renders the occupied share of the context window, Pi's footer notation", () => {
    render(
      <ContextUsageMeter
        usage={{ tokens: 90_000, contextWindow: 200_000, percent: 45 }}
      />,
    );

    expect(screen.getByText("Context 45%/200K")).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "90,000/200,000 tokens",
    );
  });

  it("shows an unknown count instead of a fabricated number when tokens are null", () => {
    render(
      <ContextUsageMeter
        usage={{ tokens: null, contextWindow: 200_000, percent: null }}
      />,
    );

    expect(screen.getByText("Context ?/200K")).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "?/200,000 tokens",
    );
  });

  it("shows the unknown state before the runtime has reported any usage", () => {
    render(<ContextUsageMeter usage={null} />);

    expect(screen.getByText("Context ?")).toBeInTheDocument();
  });

  it("escalates severity as the context fills up, at Pi's own thresholds", () => {
    const levelAt = (percent: number) => {
      const { container, unmount } = render(
        <ContextUsageMeter
          usage={{ tokens: percent * 2_000, contextWindow: 200_000, percent }}
        />,
      );
      const level = container
        .querySelector('[data-slot="context-usage-meter"]')
        ?.getAttribute("data-level");

      unmount();

      return level;
    };

    expect(levelAt(20)).toBe("normal");
    expect(levelAt(70)).toBe("normal");
    expect(levelAt(71)).toBe("warning");
    expect(levelAt(90)).toBe("warning");
    expect(levelAt(91)).toBe("critical");
  });

  it("reports the compaction instead of the share it no longer holds", () => {
    render(
      <ContextUsageMeter
        isCompacting
        usage={{ tokens: 184_000, contextWindow: 200_000, percent: 92 }}
      />,
    );

    expect(screen.getByText("Compacting…")).toBeInTheDocument();
    expect(screen.queryByText(/92%/)).not.toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "Compacting…",
    );
  });
});
