import { render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalView, type TerminalViewHandle } from "@/shared/ui/terminal/terminal-view";

// Real xterm mounts in jsdom (the design gallery does), but it cannot be
// driven or inspected from outside, so wiring is asserted against a mock.
const mocks = vi.hoisted(() => {
  class MockTerminal {
    static instances: MockTerminal[] = [];

    cols = 80;
    rows = 24;
    disposed = false;
    focused = false;
    openedIn: Element | null = null;
    written: string[] = [];
    options: Record<string, unknown>;
    private dataListeners = new Set<(data: string) => void>();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MockTerminal.instances.push(this);
    }

    loadAddon() {}
    open(element: Element) {
      this.openedIn = element;
    }
    onData(listener: (data: string) => void) {
      this.dataListeners.add(listener);

      return { dispose: () => this.dataListeners.delete(listener) };
    }
    write(data: string) {
      this.written.push(data);
    }
    focus() {
      this.focused = true;
    }
    dispose() {
      this.disposed = true;
    }

    emitData(data: string) {
      for (const listener of this.dataListeners) {
        listener(data);
      }
    }
  }

  class MockFitAddon {
    static instances: MockFitAddon[] = [];
    fit = vi.fn();

    constructor() {
      MockFitAddon.instances.push(this);
    }
  }

  return { MockTerminal, MockFitAddon };
});

vi.mock("@xterm/xterm", () => ({ Terminal: mocks.MockTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: mocks.MockFitAddon }));

describe("TerminalView", () => {
  beforeEach(() => {
    mocks.MockTerminal.instances = [];
    mocks.MockFitAddon.instances = [];
  });

  it("opens xterm in the container and fits it on mount", () => {
    const onResize = vi.fn();
    const { getByTestId } = render(<TerminalView onResize={onResize} />);

    const terminal = mocks.MockTerminal.instances[0];
    const fitAddon = mocks.MockFitAddon.instances[0];

    expect(terminal?.openedIn).toBe(getByTestId("terminal-view"));
    // Chrome colors come from the token bridge; the ANSI palette stays
    // conventional (terminal semantics, not UI chrome).
    expect(terminal?.options.theme).toMatchObject({ red: "#cd3131" });
    expect(fitAddon?.fit).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(80, 24);
  });

  it("forwards xterm input to onData", () => {
    const onData = vi.fn();

    render(<TerminalView onData={onData} />);

    mocks.MockTerminal.instances[0]?.emitData("ls\n");

    expect(onData).toHaveBeenCalledWith("ls\n");
  });

  it("exposes write and focus through the ref handle", () => {
    const handle = createRef<TerminalViewHandle>();

    render(<TerminalView ref={handle} />);

    handle.current?.write("scrollback chunk");
    handle.current?.focus();

    const terminal = mocks.MockTerminal.instances[0];

    expect(terminal?.written).toEqual(["scrollback chunk"]);
    expect(terminal?.focused).toBe(true);
  });

  it("refits when the container resizes", async () => {
    const onResize = vi.fn();

    render(<TerminalView onResize={onResize} />);

    // The test ResizeObserver (test/setup.ts) fires once per observed element.
    await waitFor(() => {
      expect(mocks.MockFitAddon.instances[0]?.fit).toHaveBeenCalledTimes(2);
    });
    expect(onResize).toHaveBeenLastCalledWith(80, 24);
  });

  it("disposes xterm on unmount", () => {
    const { unmount } = render(<TerminalView />);

    unmount();

    expect(mocks.MockTerminal.instances[0]?.disposed).toBe(true);
  });
});
