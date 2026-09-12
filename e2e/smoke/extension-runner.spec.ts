import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { launchPace } from "../fixtures/electron-app";

const plugin = process.env.PACE_TEST_SUBAGENTS_DIR;

async function files(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(filename));
    else if (entry.isFile()) result.push(filename);
  }
  return result.sort();
}

async function fingerprint(directory: string) {
  const hash = createHash("sha256");
  for (const filename of await files(directory)) {
    hash.update(filename.slice(directory.length));
    hash.update(await readFile(filename));
  }
  return hash.digest("hex");
}

test("the original async subagent completes through the packaged host and system Node", async ({}, testInfo) => {
  test.skip(!plugin, "Set PACE_TEST_SUBAGENTS_DIR to an installed pi-subagents package with its dependencies");
  const before = await fingerprint(plugin!);
  let requests = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Drain the request before sending the deterministic fixture response. */ }
    const first = ++requests === 1;
    const delta = first ? { role: "assistant", tool_calls: [{ index: 0, id: "background-probe", type: "function", function: {
      name: "subagent", arguments: JSON.stringify({ agent: "probe", task: "Return BACKGROUND_OK without using tools or changing files.", async: true, model: "pace-test/probe" }),
    } }] } : { role: "assistant", content: "BACKGROUND_OK" };
    const base = { id: "fixture", object: "chat.completion.chunk", created: 1, model: "probe" };
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: first ? "tool_calls" : "stop" }], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture server address");
  const app = await launchPace({ seedProject: true, emptyPath: true,
    environment: { PACE_NODE_PATH: process.execPath },
    agentFiles: {
      "settings.json": JSON.stringify({ defaultProvider: "pace-test", defaultModel: "probe", defaultThinkingLevel: "off", extensions: [join(plugin!, "index.ts")] }),
      "models.json": JSON.stringify({ providers: { "pace-test": {
        baseUrl: `http://127.0.0.1:${address.port}/v1`, api: "openai-completions", apiKey: "local-test-placeholder",
        models: [{ id: "probe", name: "Probe", reasoning: false, input: ["text"], contextWindow: 16000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
      } } }),
      "agents/probe.md": "---\nname: probe\ndescription: Runtime compatibility test\nmodel: pace-test/probe\ntools: read\n---\nReturn BACKGROUND_OK without tools.\n",
    },
  });
  try {
    const created = await app.window.evaluate(cwd => window.pace!.invoke<{ piSessionId: string }>("create_session", {
      sessionId: "background-probe", projectId: cwd, cwd,
    }), app.project!.path);
    await app.window.evaluate(piSessionId => window.pace!.invoke("send_prompt", { piSessionId, prompt: "Start the background probe." }), created.piSessionId);
    const root = dirname(app.project!.path);
    const completed = async () => {
      const paths = await files(root);
      const statuses = await Promise.all(paths.filter(path => path.endsWith("/status.json")).map(async path => {
        try { return JSON.parse(await readFile(path, "utf8")); } catch { return {}; }
      }));
      return statuses.find(status => status.state === "complete" && status.processTerminal?.state === "observed");
    };
    await expect.poll(completed, { timeout: 30_000 }).toBeTruthy();
    const status = await completed();
    expect(status.processTerminal.instances[0].exitCode).toBe(0);
    expect(status.totalTokens.total).toBeGreaterThan(0);
    await expect.poll(async () => {
      const sessions = (await files(join(root, "agent"))).filter(path => path.endsWith(".jsonl"));
      return (await Promise.all(sessions.map(path => readFile(path, "utf8")))).some(content => content.includes('"customType":"subagent-notify"') && content.includes("BACKGROUND_OK"));
    }).toBe(true);
    expect(await fingerprint(plugin!)).toBe(before);
    await testInfo.attach("background-result", { body: JSON.stringify({ requests, pluginUnchanged: true, status }), contentType: "application/json" });
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
