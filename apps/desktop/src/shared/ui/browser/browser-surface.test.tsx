import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BrowserSurface } from "@/shared/ui/browser/browser-surface";

function surfaceProps(overrides: Partial<Parameters<typeof BrowserSurface>[0]> = {}) {
  return {
    address: "",
    state: { kind: "live" } as const,
    canGoBack: false,
    canGoForward: false,
    annotationCount: 0,
    designMode: false,
    onAddressChange: vi.fn(),
    onAddressSubmit: vi.fn(),
    onBack: vi.fn(),
    onForward: vi.fn(),
    onReload: vi.fn(),
    onOpenExternal: vi.fn(),
    onClearAnnotations: vi.fn(),
    onDesignModeChange: vi.fn(),
    onSendToComposer: vi.fn(),
    ...overrides,
  };
}

function renderSurface(overrides: Partial<Parameters<typeof BrowserSurface>[0]> = {}) {
  const props = surfaceProps(overrides);

  render(<BrowserSurface {...props} />);

  return props;
}

describe("BrowserSurface", () => {
  // ADR-0028 (2026-09-05): the address band is the surface's first row, so it
  // sits on Chat's 40px title baseline instead of under a dock header.
  it("puts the address band on the surface's 40px first row", () => {
    renderSurface({ address: "localhost:5173" });

    const bar = screen.getByTestId("session-surface-bar");

    expect(bar).toHaveClass("h-10");
    expect(within(bar).getByRole("textbox", { name: "Address" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(
      within(bar).getByRole("button", { name: "Open in default browser" }),
    ).toBeInTheDocument();
  });

  it("renders no first row where there is no chrome to put in it", () => {
    renderSurface({ state: { kind: "unsupported" } });

    expect(screen.queryByTestId("session-surface-bar")).not.toBeInTheDocument();
  });

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

  it("turns design mode on from the toolbar", async () => {
    const user = userEvent.setup();
    const onDesignModeChange = vi.fn();

    renderSurface({ onDesignModeChange });

    await user.click(screen.getByRole("button", { name: "Design" }));

    expect(onDesignModeChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it("reports how many elements are marked and clears them only when there are", async () => {
    const user = userEvent.setup();
    const props = surfaceProps();
    const view = render(<BrowserSurface {...props} />);

    expect(screen.queryByTestId("browser-annotation-count")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear marks" })).toBeDisabled();

    view.rerender(<BrowserSurface {...props} annotationCount={2} designMode />);

    expect(screen.getByTestId("browser-annotation-count")).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: "Clear marks" }));

    expect(props.onClearAnnotations).toHaveBeenCalledTimes(1);
  });

  it("sends the marks to the composer, but only once there are some", async () => {
    const user = userEvent.setup();
    const props = surfaceProps();
    const view = render(<BrowserSurface {...props} />);
    const send = () => screen.getByRole("button", { name: "Send to composer" });

    // An unmarked page has nothing to say: the prompt would be a URL and a
    // screenshot with no question attached to it.
    expect(send()).toBeDisabled();

    view.rerender(<BrowserSurface {...props} annotationCount={1} />);
    await user.click(send());

    expect(props.onSendToComposer).toHaveBeenCalledTimes(1);
  });

  it("keeps the design controls out of reach until a page is live", () => {
    renderSurface({ state: { kind: "empty" }, annotationCount: 2, designMode: true });

    const design = screen.getByRole("button", { name: "Design" });

    expect(design).toBeDisabled();
    // Nothing is marked where there is no page, so a pressed-but-disabled
    // toggle and a leftover count would both be lying.
    expect(design).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("browser-annotation-count")).not.toBeInTheDocument();
  });

  it("only offers Open in browser once there is a page to open", () => {
    renderSurface({ state: { kind: "empty" } });
    expect(screen.getByRole("button", { name: "Open in default browser" })).toBeDisabled();

    screen.getByRole("textbox", { name: "Address" });
  });
});
