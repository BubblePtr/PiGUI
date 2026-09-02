import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendRpcEvent } from "@pigui/backend";
import { SessionTerminalPanel } from "@/pages/session-terminal-panel";

type TerminalBridge = {
  emit: (type: string, payload: Record<string, unknown>) => void;
  invoke: ReturnType<typeof vi.fn>;
  /** Resolves every in-flight attach_terminal call (when deferAttach is on). */
  resolveAttaches: () => void;
};

function terminalEvent(type: string, payload: Record<string, unknown>): BackendRpcEvent {
  return {
    type: "event",
    event: {
      id: `event-${type}`,
      seq: 1,
      sessionId: "session-1",
      piSessionId: "pi-session-1",
      type,
      ts: "2026-09-02T10:00:00.000Z",
      payload,
    },
  } as BackendRpcEvent;
}

function runningTerminal(terminalId: string) {
  return {
    terminalId,
    sessionId: "session-1",
    cwd: "/checkout",
    status: "running" as const,
  };
}

/** Stands up window.pigui with a scripted terminal backend. */
function setupTerminalBridge(
  existing: ReturnType<typeof runningTerminal>[] = [],
  options: { attachScrollback?: string; attachEnd?: number; deferAttach?: boolean } = {},
): TerminalBridge {
  const listeners = new Set<(event: BackendRpcEvent) => void>();
  const attachResolvers: Array<() => void> = [];
  let created = 0;
  const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "list_terminals":
        return existing;
      case "open_terminal":
        created += 1;
        return runningTerminal(`term-new-${created}`);
      case "attach_terminal": {
        const result = {
          scrollback: options.attachScrollback ?? "",
          end: options.attachEnd ?? 0,
        };

        if (!options.deferAttach) {
          return result;
        }

        return new Promise<typeof result>((resolve) => {
          attachResolvers.push(() => resolve(result));
        });
      }
      case "terminal_input":
      case "resize_terminal":
      case "close_terminal":
        return null;
      default:
        throw new Error(`unexpected backend command ${command}`);
    }
  });

  window.pigui = {
    invoke: invoke as unknown as NonNullable<typeof window.pigui>["invoke"],
    onBackendEvent: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    onBrowserEvent: () => () => {},
    onWindowFocusChanged: () => () => {},
  };

  return {
    invoke,
    emit: (type, payload) => {
      act(() => {
        for (const listener of listeners) {
          listener(terminalEvent(type, payload));
        }
      });
    },
    resolveAttaches: () => {
      for (const resolve of attachResolvers.splice(0)) {
        resolve();
      }
    },
  };
}

describe("SessionTerminalPanel", () => {
  beforeEach(() => {
    delete window.pigui;
  });

  it("shows a calm empty state outside the desktop app", () => {
    render(<SessionTerminalPanel sessionId="session-1" />);

    expect(screen.getByText("Terminal requires the desktop app.")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("auto-opens one shell when the Session has none", async () => {
    const bridge = setupTerminalBridge();
    const onInstancesChange = vi.fn();

    render(
      <SessionTerminalPanel sessionId="session-1" onInstancesChange={onInstancesChange} />,
    );

    const strip = await screen.findByRole("tablist", { name: "Terminal instances" });

    expect(await within(strip).findByRole("tab", { name: "Terminal 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(bridge.invoke).toHaveBeenCalledWith("open_terminal", {
      sessionId: "session-1",
      cols: 80,
      rows: 24,
    });
    await waitFor(() => {
      expect(onInstancesChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ terminalId: "term-new-1" }),
      ]);
    });
  });

  it("lists existing instances, attaches the active one, and switches tabs", async () => {
    const bridge = setupTerminalBridge([runningTerminal("term-a"), runningTerminal("term-b")]);
    const user = userEvent.setup();

    render(<SessionTerminalPanel sessionId="session-1" />);

    const strip = await screen.findByRole("tablist", { name: "Terminal instances" });

    expect(within(strip).getByRole("tab", { name: "Terminal 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith("attach_terminal", { terminalId: "term-a" });
    });

    await user.click(within(strip).getByRole("tab", { name: "Terminal 2" }));

    expect(within(strip).getByRole("tab", { name: "Terminal 2" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith("attach_terminal", { terminalId: "term-b" });
    });
  });

  it("opens a new shell from the strip and switches to it", async () => {
    const bridge = setupTerminalBridge([runningTerminal("term-a")]);
    const user = userEvent.setup();

    render(<SessionTerminalPanel sessionId="session-1" />);

    const strip = await screen.findByRole("tablist", { name: "Terminal instances" });
    await within(strip).findByRole("tab", { name: "Terminal 1" });

    await user.click(within(strip).getByRole("button", { name: "New terminal" }));

    expect(
      await within(strip).findByRole("tab", { name: "Terminal 2" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(bridge.invoke).toHaveBeenCalledWith("open_terminal", {
      sessionId: "session-1",
      cols: 80,
      rows: 24,
    });
  });

  it("closes a tab, activates the neighbor, and respawns when the last one closes", async () => {
    const bridge = setupTerminalBridge([runningTerminal("term-a"), runningTerminal("term-b")]);
    const user = userEvent.setup();

    render(<SessionTerminalPanel sessionId="session-1" />);

    const strip = await screen.findByRole("tablist", { name: "Terminal instances" });
    await within(strip).findByRole("tab", { name: "Terminal 2" });

    // Closing the inactive tab keeps the active one put.
    await user.click(within(strip).getByRole("button", { name: "Close Terminal 2" }));

    expect(bridge.invoke).toHaveBeenCalledWith("close_terminal", { terminalId: "term-b" });
    expect(within(strip).queryByRole("tab", { name: "Terminal 2" })).not.toBeInTheDocument();
    expect(within(strip).getByRole("tab", { name: "Terminal 1" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Closing the last tab starts a fresh shell rather than leaving a dead panel.
    await user.click(within(strip).getByRole("button", { name: "Close Terminal 1" }));

    expect(bridge.invoke).toHaveBeenCalledWith("close_terminal", { terminalId: "term-a" });
    expect(
      await within(strip).findByRole("tab", { name: "Terminal 1" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(bridge.invoke).toHaveBeenCalledWith(
      "open_terminal",
      expect.objectContaining({ sessionId: "session-1" }),
    );
  });

  it("mutes an instance's tab when its process exits", async () => {
    const bridge = setupTerminalBridge([runningTerminal("term-a")]);

    render(<SessionTerminalPanel sessionId="session-1" />);

    const strip = await screen.findByRole("tablist", { name: "Terminal instances" });
    await within(strip).findByRole("tab", { name: "Terminal 1" });

    bridge.emit("terminal_exit", { terminalId: "term-a", exitCode: 0 });

    expect(
      await within(strip).findByRole("tab", {
        name: (name) => name.includes("Terminal 1") && name.includes("(exited)"),
      }),
    ).toBeInTheDocument();
    expect(within(strip).getByText("(exited)")).toHaveClass("text-muted");
  });

  it("replays scrollback without duplicating output that raced the attach", async () => {
    const bridge = setupTerminalBridge([runningTerminal("term-a")], {
      attachScrollback: "prompt$ ",
      attachEnd: 8,
      deferAttach: true,
    });

    render(<SessionTerminalPanel sessionId="session-1" />);

    const strip = await screen.findByRole("tablist", { name: "Terminal instances" });
    await within(strip).findByRole("tab", { name: "Terminal 1" });
    await waitFor(() => {
      expect(bridge.invoke).toHaveBeenCalledWith("attach_terminal", { terminalId: "term-a" });
    });

    // These bytes streamed while attach was in flight: the first chunk is
    // already inside the scrollback, the second straddles its end offset.
    bridge.emit("terminal_output", { terminalId: "term-a", data: "prompt$ ", end: 8 });
    bridge.emit("terminal_output", { terminalId: "term-a", data: "cd", end: 10 });

    await act(async () => {
      bridge.resolveAttaches();
    });

    const rows = document.querySelector(".xterm-rows");

    await waitFor(() => {
      expect(rows?.textContent).toContain("prompt$ cd");
    });
    expect(rows?.textContent?.match(/prompt\$/g)).toHaveLength(1);
  });
});
