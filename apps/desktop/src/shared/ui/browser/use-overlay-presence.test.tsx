import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { PiSheet } from "@/shared/ui/pi-sheet";
import { useOverlayPresence } from "@/shared/ui/browser/use-overlay-presence";

/**
 * Driven by the real overlay components rather than hand-written markers: the
 * whole point of the hook is that it recognises what Astryx and Base UI
 * actually put in the DOM, which no fixture can vouch for.
 */
function Probe({ enabled = true }: { enabled?: boolean }) {
  const overlayOpen = useOverlayPresence(enabled);

  return <span data-testid="probe">{overlayOpen ? "overlay" : "clear"}</span>;
}

describe("useOverlayPresence", () => {
  it("follows an Astryx tooltip opening and closing", async () => {
    const user = userEvent.setup();

    render(
      <>
        <Probe />
        <Tooltip content="Preview a running dev server" delay={0}>
          <IconButton icon={<span>i</span>} label="Browser" />
        </Tooltip>
      </>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent("clear");

    await user.hover(screen.getByRole("button", { name: "Browser" }));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("overlay"),
    );

    await user.unhover(screen.getByRole("button", { name: "Browser" }));
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("clear"));
  });

  it("follows a Base UI sheet opening and closing", async () => {
    function SheetProbe() {
      const [isOpen, setIsOpen] = useState(false);

      return (
        <>
          <Probe />
          <button type="button" onClick={() => setIsOpen((open) => !open)}>
            Toggle sheet
          </button>
          <PiSheet isOpen={isOpen} onOpenChange={setIsOpen}>
            <PiSheet.Content>
              <PiSheet.Header>
                <PiSheet.Heading>Sheet</PiSheet.Heading>
              </PiSheet.Header>
              <PiSheet.Body>body</PiSheet.Body>
            </PiSheet.Content>
          </PiSheet>
        </>
      );
    }

    const user = userEvent.setup();

    render(<SheetProbe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("clear");

    await user.click(screen.getByRole("button", { name: "Toggle sheet" }));
    await waitFor(() =>
      expect(screen.getByTestId("probe")).toHaveTextContent("overlay"),
    );

    // The open sheet traps focus and hides the rest of the tree from a11y, so
    // Escape (Base UI's own dismissal) is the way back out.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("clear"));
  });

  it("reports nothing while disabled, so a hidden surface does no work", async () => {
    const user = userEvent.setup();

    render(
      <>
        <Probe enabled={false} />
        <Tooltip content="Preview a running dev server" delay={0}>
          <IconButton icon={<span>i</span>} label="Browser" />
        </Tooltip>
      </>,
    );

    await user.hover(screen.getByRole("button", { name: "Browser" }));
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(screen.getByTestId("probe")).toHaveTextContent("clear");
  });
});
