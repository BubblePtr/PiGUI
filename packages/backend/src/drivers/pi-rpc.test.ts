import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodePiRpcProcess } from "./pi-rpc";
import type { PiRpcRawEvent } from "@pigui/core";

async function writePiFixtureScript() {
  const dir = await mkdtemp(join(tmpdir(), "pig-pi-rpc-"));
  const scriptPath = join(dir, "pi-rpc-fixture.cjs");

  await writeFile(
    scriptPath,
    `const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "booted" }] } }));
console.error("stderr diagnostic");
rl.on("line", (line) => {
  const command = JSON.parse(line);
  console.log(JSON.stringify({ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "streaming" }] } }));
  console.log(JSON.stringify({ id: command.id, type: "response", command: command.type, success: true, data: { sessionId: "pi-session-1" } }));
});`,
  );

  return scriptPath;
}

async function waitForEventCount(events: unknown[], count: number) {
  const deadline = Date.now() + 1_000;

  while (events.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("backend Pi RPC process", () => {
  it("routes response records to send callers and pushes runtime events", async () => {
    const scriptPath = await writePiFixtureScript();
    const processTransport = createNodePiRpcProcess({ responseTimeoutMs: 2_000 });
    const events: PiRpcRawEvent[] = [];

    const unsubscribe = processTransport.onEvent((event) => {
      events.push(event);
    });
    await processTransport.start({
      command: process.execPath as "pi",
      args: [scriptPath],
      cwd: process.cwd(),
    });

    const response = await processTransport.send({ id: "req-1", type: "get_state" });
    await waitForEventCount(events, 3);
    await processTransport.stop?.();
    unsubscribe();

    expect(response).toMatchObject({
      id: "req-1",
      type: "response",
      command: "get_state",
      success: true,
      data: { sessionId: "pi-session-1" },
    });
    expect(events[0]).toEqual({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "booted" }],
      },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: "error",
          error: "stderr diagnostic",
        },
        {
          type: "message_update",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "streaming" }],
          },
        },
      ]),
    );
  });
});
