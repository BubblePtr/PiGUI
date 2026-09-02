import { describe, expect, it, vi } from "vitest";
import {
  createTerminalManager,
  type PtyHandle,
  type SpawnPty,
  type TerminalManagerEvent,
} from "./terminal";

type FakePty = {
  handle: PtyHandle;
  written: string[];
  resizes: Array<{ cols: number; rows: number }>;
  killCount: number;
  emitData(data: string): void;
  emitExit(exitCode: number): void;
};

function createFakePty(): FakePty {
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(event: { exitCode: number }) => void> = [];
  const fake: FakePty = {
    written: [],
    resizes: [],
    killCount: 0,
    handle: {
      write(data) {
        fake.written.push(data);
      },
      resize(cols, rows) {
        fake.resizes.push({ cols, rows });
      },
      kill() {
        fake.killCount += 1;
      },
      onData(listener) {
        dataListeners.push(listener);
      },
      onExit(listener) {
        exitListeners.push(listener);
      },
    },
    emitData(data) {
      for (const listener of dataListeners) {
        listener(data);
      }
    },
    emitExit(exitCode) {
      for (const listener of exitListeners) {
        listener({ exitCode });
      }
    },
  };

  return fake;
}

function createFakeSpawnPty() {
  const calls: Array<Parameters<SpawnPty>[0]> = [];
  const ptys: FakePty[] = [];
  const spawnPty: SpawnPty = (input) => {
    calls.push(input);
    const pty = createFakePty();
    ptys.push(pty);

    return pty.handle;
  };

  return { spawnPty, calls, ptys };
}

function collectEvents(manager: { onEvent: (listener: (event: TerminalManagerEvent) => void) => () => void }) {
  const events: TerminalManagerEvent[] = [];
  manager.onEvent((event) => {
    events.push(event);
  });

  return events;
}

describe("terminal manager", () => {
  it("creates terminals with term- ids and spawns a login shell with cwd and TERM env", async () => {
    const { spawnPty, calls } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty });

    const info = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/checkout/project",
      cols: 120,
      rows: 40,
    });

    expect(info).toEqual({
      terminalId: expect.stringMatching(/^term-/),
      sessionId: "session-1",
      cwd: "/checkout/project",
      status: "running",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      file: process.env.SHELL ?? "/bin/zsh",
      args: ["-l"],
      cwd: "/checkout/project",
      cols: 120,
      rows: 40,
    });
    expect(calls[0]?.env).toMatchObject({
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "PiGUI",
    });
    expect(Object.values(calls[0]?.env ?? {})).toSatisfy(
      (values) => values.every((value: unknown) => typeof value === "string"),
    );
    expect(manager.list("session-1")).toEqual([info]);
  });

  it("emits output events, accumulates scrollback, and replays it on attach", async () => {
    const { spawnPty, ptys } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty });
    const events = collectEvents(manager);

    const info = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/checkout/project",
      cols: 80,
      rows: 24,
    });

    ptys[0]?.emitData("first ");
    ptys[0]?.emitData("second\n");

    expect(events).toEqual([
      {
        kind: "output",
        terminalId: info.terminalId,
        sessionId: "session-1",
        piSessionId: "pi-1",
        data: "first ",
        end: 6,
      },
      {
        kind: "output",
        terminalId: info.terminalId,
        sessionId: "session-1",
        piSessionId: "pi-1",
        data: "second\n",
        end: 13,
      },
    ]);
    expect(manager.attach(info.terminalId)).toEqual({
      scrollback: "first second\n",
      end: 13,
    });
    expect(manager.attach("term-unknown")).toEqual({ scrollback: "", end: 0 });
  });

  it("trims scrollback from the front beyond the limit", async () => {
    const { spawnPty, ptys } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty, scrollbackLimit: 10 });

    const info = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/checkout/project",
      cols: 80,
      rows: 24,
    });

    ptys[0]?.emitData("0123456789");
    ptys[0]?.emitData("abcdef");

    expect(manager.attach(info.terminalId)).toEqual({ scrollback: "6789abcdef", end: 16 });
  });

  it("passes writes and resizes through to the pty and throws for unknown terminals", async () => {
    const { spawnPty, ptys } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty });

    const info = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/checkout/project",
      cols: 80,
      rows: 24,
    });

    manager.write(info.terminalId, "ls\r");
    manager.resize(info.terminalId, 132, 43);

    expect(ptys[0]?.written).toEqual(["ls\r"]);
    expect(ptys[0]?.resizes).toEqual([{ cols: 132, rows: 43 }]);
    expect(() => manager.write("term-gone", "x")).toThrow(
      'Terminal "term-gone" was not found.',
    );
    expect(() => manager.resize("term-gone", 80, 24)).toThrow(
      'Terminal "term-gone" was not found.',
    );
  });

  it("marks pty exit, emits an exit event, and keeps the terminal listed", async () => {
    const { spawnPty, ptys } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty });
    const events = collectEvents(manager);

    const info = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/checkout/project",
      cols: 80,
      rows: 24,
    });

    ptys[0]?.emitExit(2);

    expect(events).toEqual([
      {
        kind: "exit",
        terminalId: info.terminalId,
        sessionId: "session-1",
        piSessionId: "pi-1",
        exitCode: 2,
      },
    ]);
    expect(manager.list("session-1")).toEqual([
      { ...info, status: "exited", exitCode: 2 },
    ]);
  });

  it("close kills a running terminal and drops the record; exited and unknown terminals are just dropped", async () => {
    const { spawnPty, ptys } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty });

    const running = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/checkout/project",
      cols: 80,
      rows: 24,
    });
    const exited = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/checkout/project",
      cols: 80,
      rows: 24,
    });

    ptys[1]?.emitExit(0);

    manager.close(running.terminalId);
    manager.close(exited.terminalId);
    manager.close("term-unknown");

    expect(ptys[0]?.killCount).toBe(1);
    expect(ptys[1]?.killCount).toBe(0);
    expect(manager.list("session-1")).toEqual([]);
  });

  it("keeps instances isolated per session when listing", async () => {
    const { spawnPty } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty });

    const first = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/one",
      cols: 80,
      rows: 24,
    });
    const second = await manager.create({
      sessionId: "session-2",
      piSessionId: "pi-2",
      cwd: "/two",
      cols: 80,
      rows: 24,
    });

    expect(manager.list("session-1")).toEqual([first]);
    expect(manager.list("session-2")).toEqual([second]);
    expect(manager.list("session-3")).toEqual([]);
  });

  it("disposeAll kills every terminal and clears the registry", async () => {
    const { spawnPty, ptys } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty });

    await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/one",
      cols: 80,
      rows: 24,
    });
    await manager.create({
      sessionId: "session-2",
      piSessionId: "pi-2",
      cwd: "/two",
      cols: 80,
      rows: 24,
    });

    manager.disposeAll();

    expect(ptys.map((pty) => pty.killCount)).toEqual([1, 1]);
    expect(manager.list("session-1")).toEqual([]);
    expect(manager.list("session-2")).toEqual([]);
  });

  it("stops notifying after the event listener unsubscribes", async () => {
    const { spawnPty, ptys } = createFakeSpawnPty();
    const manager = createTerminalManager({ spawnPty });
    const listener = vi.fn();
    const unsubscribe = manager.onEvent(listener);

    const info = await manager.create({
      sessionId: "session-1",
      piSessionId: "pi-1",
      cwd: "/one",
      cols: 80,
      rows: 24,
    });

    ptys[0]?.emitData("before");
    unsubscribe();
    ptys[0]?.emitData("after");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.attach(info.terminalId)).toEqual({
      scrollback: "beforeafter",
      end: 11,
    });
  });
});
