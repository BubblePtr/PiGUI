import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrowserSurface } from "@/shared/ui/browser/browser-surface";

function renderSurface(overrides: Partial<Parameters<typeof BrowserSurface>[0]> = {}) {
  const props = {
    address: "",
    state: { kind: "live" } as const,
    canGoBack: false,
    canGoForward: false,
    onAddressChange: vi.fn(),
    onAddressSubmit: vi.fn(),
    onBack: vi.fn(),
    onForward: vi.fn(),
    onReload: vi.fn(),
    onOpenExternal: vi.fn(),
    ...overrides,
  };

  render(<BrowserSurface {...props} />);

  return props;
}

describe("BrowserSurface", () => {
  it("submits the typed address on Enter", async () => {
    const user = userEvent.setup();
    const onAddressSubmit = vi.fn();

    renderSurface({ address: "localhost:5173", onAddressSubmit });

    await user.click(screen.getByRole("textbox", { name: "Address" }));
    await user.keyboard("{Enter}");

    expect(onAddressSubmit).toHaveBeenCalledWith("localhost:5173");
  });

  it("disables history controls the page cannot use", () => {
    renderSurface({ canGoBack: true, canGoForward: false });

    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();
  });

  it("renders no viewport placeholder below the dock breakpoint", () => {
    renderSurface({ state: { kind: "narrow" } });

    // The placeholder is what drives the native view's bounds. Rendering one
    // inside the Sheet fallback would paint the native view over the overlay.
    expect(screen.queryByTestId("browser-viewport")).not.toBeInTheDocument();
    expect(screen.getByText(/widen the window/i)).toBeInTheDocument();
  });

  it("offers a retry from the failed-load state", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();

    renderSurface({
      state: { kind: "error", message: "ERR_CONNECTION_REFUSED" },
      address: "http://localhost:5173/",
      onReload,
    });

    expect(screen.queryByTestId("browser-viewport")).not.toBeInTheDocument();
    expect(screen.getByText(/ERR_CONNECTION_REFUSED/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("swaps a still of the page in for the viewport while an overlay is open", () => {
    renderSurface({ snapshot: "data:image/png;base64,SNAP" });

    const snapshot = screen.getByTestId("browser-snapshot");

    // Same rect as the placeholder the native view was painting into, so the
    // swap does not shift anything on screen.
    expect(snapshot).toHaveAttribute("src", "data:image/png;base64,SNAP");
    expect(screen.getByTestId("browser-viewport")).toContainElement(snapshot);
  });

  it("only offers Open in browser once there is a page to open", () => {
    renderSurface({ state: { kind: "empty" } });
    expect(screen.getByRole("button", { name: "Open in default browser" })).toBeDisabled();

    screen.getByRole("textbox", { name: "Address" });
  });
});
