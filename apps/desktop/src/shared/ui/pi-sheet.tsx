import { Dialog } from "@base-ui-components/react/dialog";
import type { ReactNode } from "react";
import { Cancel } from "@/shared/ui/icons";

/**
 * Right-side sheet on Base UI Dialog: overlay, focus trap, Escape and
 * overlay-click close come from Base UI; the slide-in panel styling lives in
 * primitives.css on Astryx tokens. Replaces the HeroUI Pro Sheet.
 */
export function PiSheet({
  isOpen,
  onOpenChange,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="pi-sheet__overlay" data-slot="sheet-overlay" />
        {children}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PiSheetContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Popup
      className={`pi-sheet__panel ${className}`.trim()}
      data-slot="sheet-panel"
    >
      {children}
    </Dialog.Popup>
  );
}

function PiSheetCloseTrigger() {
  return (
    <Dialog.Close aria-label="Close" className="pi-sheet__close" data-slot="sheet-close">
      <Cancel aria-hidden="true" className="size-4" />
    </Dialog.Close>
  );
}

function PiSheetHeader({ children }: { children: ReactNode }) {
  return (
    <header className="pi-sheet__header" data-slot="sheet-header">
      {children}
    </header>
  );
}

function PiSheetHeading({ children }: { children: ReactNode }) {
  return (
    <Dialog.Title className="pi-sheet__heading" data-slot="sheet-heading">
      {children}
    </Dialog.Title>
  );
}

function PiSheetBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`pi-sheet__body ${className}`.trim()} data-slot="sheet-body">
      {children}
    </div>
  );
}

PiSheet.Content = PiSheetContent;
PiSheet.CloseTrigger = PiSheetCloseTrigger;
PiSheet.Header = PiSheetHeader;
PiSheet.Heading = PiSheetHeading;
PiSheet.Body = PiSheetBody;
