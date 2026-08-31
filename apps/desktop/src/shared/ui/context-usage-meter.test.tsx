import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextUsageMeter } from "@/shared/ui/context-usage-meter";

describe("ContextUsageMeter", () => {
  it("renders a ring whose accessible name and tooltip carry the full readout", () => {
    render(
      <ContextUsageMeter
        usage={{ tokens: 90_000, contextWindow: 200_000, percent: 45 }}
      />,
    );

    const ring = screen.getByRole("img", {
      name: "Context 45% · 200K",
    });
    expect(ring).toHaveAttribute("data-level", "normal");
    expect(ring.className).toContain("text-[var(--pigui-data-green)]");
    expect(screen.getByRole("tooltip", { hidden: true })).toHaveTextContent(
      "Context 45% · 200K",
    );
  });

  it("keeps the unknown count honest instead of fabricating a number", () => {
    render(
      <ContextUsageMeter
        usage={{ tokens: null, contextWindow: 200_000, percent: null }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Context ? · 200K" }),
    ).toHaveAttribute("data-level", "unknown");
  });

  it("shows the unknown state before the runtime has reported any usage", () => {
    render(<ContextUsageMeter usage={null} />);

    expect(
      screen.getByRole("img", { name: "Context usage not reported yet" }),
    ).toHaveAttribute("data-level", "unknown");
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

    const ring = screen.getByRole("img", {
      name: "Compacting… · 200K",
    });
    expect(ring).toHaveAttribute("data-level", "compacting");
    expect(ring.getAttribute("aria-label")).not.toContain("92%");
  });
});
