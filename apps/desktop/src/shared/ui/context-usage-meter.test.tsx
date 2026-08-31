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

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
    expect(screen.getByText("45%/200K")).toBeInTheDocument();
  });

  it("shows an unknown count instead of a fabricated number when tokens are null", () => {
    render(
      <ContextUsageMeter
        usage={{ tokens: null, contextWindow: 200_000, percent: null }}
      />,
    );

    expect(screen.getByText("?/200K")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("shows the unknown state before the runtime has reported any usage", () => {
    render(<ContextUsageMeter usage={null} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it.each(["default", "compact"] as const)(
    "escalates severity as the context fills up, at Pi's own thresholds (%s)",
    (variant) => {
      const levelAt = (percent: number) => {
        const { unmount } = render(
          <ContextUsageMeter
            usage={{ tokens: percent * 2_000, contextWindow: 200_000, percent }}
            variant={variant}
          />,
        );
        const level = screen
          .getByRole("progressbar")
          .closest('[data-slot="context-usage-meter"]')
          ?.getAttribute("data-level");

        unmount();

        return level;
      };

      expect(levelAt(20)).toBe("normal");
      expect(levelAt(70)).toBe("normal");
      expect(levelAt(71)).toBe("warning");
      expect(levelAt(90)).toBe("warning");
      expect(levelAt(91)).toBe("critical");
    },
  );

  it("animates an indeterminate bar while a compaction is running", () => {
    render(
      <ContextUsageMeter
        isCompacting
        usage={{ tokens: 184_000, contextWindow: 200_000, percent: 92 }}
      />,
    );

    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Compacting…")).toBeInTheDocument();
  });
});

// The toolbar row is a few pixels tall and shared with icon actions, so the
// compact form shows the share alone and hands the token detail to a tooltip.
describe("ContextUsageMeter, compact", () => {
  it("keeps the share on screen and moves the token counts into a tooltip", () => {
    render(
      <ContextUsageMeter
        usage={{ tokens: 90_000, contextWindow: 200_000, percent: 45 }}
        variant="compact"
      />,
    );

    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.queryByText("45%/200K")).not.toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "90,000/200,000 tokens",
    );
  });

  it("says the count is unknown instead of inventing one", () => {
    render(
      <ContextUsageMeter
        usage={{ tokens: null, contextWindow: 200_000, percent: null }}
        variant="compact"
      />,
    );

    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "?/200,000 tokens",
    );
  });

  it("drops the stale share while a compaction is in flight", () => {
    render(
      <ContextUsageMeter
        isCompacting
        usage={{ tokens: 184_000, contextWindow: 200_000, percent: 92 }}
        variant="compact"
      />,
    );

    expect(screen.queryByText("92%")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "Compacting…",
    );
  });
});
