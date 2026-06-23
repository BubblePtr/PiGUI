import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeLargeSessionDetail, largeSessionDetailApproxBytes } from "./session-detail.fixtures";
import { SessionTimeline } from "./session-detail";

describe("SessionTimeline", () => {
  it("renders the large fixture as collapsed virtual rows by default", () => {
    const session = makeLargeSessionDetail();
    const { container } = render(<SessionTimeline turns={session.turns} />);

    expect(largeSessionDetailApproxBytes).toBeGreaterThan(8 * 1024 * 1024);
    expect(screen.getByText("Plan fixture turn 0")).toBeInTheDocument();
    expect(screen.getAllByText(/\$0\.0/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Inspect the current timeline state.")).not.toBeInTheDocument();
    expect(screen.queryByText("huge output sentinel 0")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-index]").length).toBeLessThan(session.turns.length);
  });

  it("uses half-expanded thinking, folded tools, and inline thumbnails when a turn opens", async () => {
    const user = userEvent.setup();
    const session = makeLargeSessionDetail();
    render(<SessionTimeline turns={session.turns} />);

    await user.click(screen.getByRole("button", { name: /Plan fixture turn 0/i }));

    expect(screen.getByText(/Inspect the current timeline state\./)).toBeInTheDocument();
    expect(screen.queryByText(/Hidden thinking line 0/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand all" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Show input" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Show output" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText(/cat \/tmp\/fixture-0\.txt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/huge output sentinel 0/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Fixture thumbnail 0" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText(/Hidden thinking line 0/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show input" }));
    expect(screen.getByText(/cat \/tmp\/fixture-0\.txt/)).toBeInTheDocument();
  });
});
