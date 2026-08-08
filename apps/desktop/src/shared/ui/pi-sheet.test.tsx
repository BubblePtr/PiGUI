import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PiSheet } from "@/shared/ui/pi-sheet";

function SheetFixture({
  defaultOpen = true,
  onOpenChange,
}: {
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <PiSheet
      isOpen={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
    >
      <PiSheet.Content>
        <PiSheet.CloseTrigger />
        <PiSheet.Header>
          <PiSheet.Heading>Changes</PiSheet.Heading>
        </PiSheet.Header>
        <PiSheet.Body>Sheet body content</PiSheet.Body>
      </PiSheet.Content>
    </PiSheet>
  );
}

describe("PiSheet", () => {
  it("renders nothing while closed", () => {
    render(<SheetFixture defaultOpen={false} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Sheet body content")).not.toBeInTheDocument();
  });

  it("renders a right-side dialog panel with heading and body when open", () => {
    render(<SheetFixture />);

    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveClass("pi-sheet__panel");
    expect(dialog).toHaveAttribute("data-slot", "sheet-panel");
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("Sheet body content")).toBeInTheDocument();
  });

  it("closes from the close trigger", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<SheetFixture onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<SheetFixture onOpenChange={onOpenChange} />);

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
