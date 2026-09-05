import { describe, expect, it, vi } from "vitest";
import {
  createPublicPiSdkRuntimeFactory,
  createPublicPiSdkRuntimeForker,
  createPublicPiSdkRuntimeResumer,
} from "./pi-sdk-runtime-adapter";

function fixture() {
  let ready = false;
  const subscribers = new Set<(event: unknown) => void>();
  const sessionManager = {
    getCwd: () => "/project",
    getEntry: () => ({ type: "message", parentId: "parent", message: { role: "user", content: "hello" } }),
    createBranchedSession: () => "/fork.jsonl",
  };
  const session = {
    sessionId: "pi-extension-test",
    isStreaming: false,
    messages: [],
    sessionManager,
    prompt: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    dispose: vi.fn(),
    subscribe: vi.fn((listener: (event: unknown) => void) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    }),
    getToolDefinition: () => ready ? { description: "initialized tool", parameters: {} } : undefined,
    bindExtensions: vi.fn(async (bindings: { onError?: (error: { extensionPath: string; event: string; error: string }) => void }) => {
      ready = true;
      bindings.onError?.({ extensionPath: "/broken-start.ts", event: "session_start", error: "startup failed" });
    }),
  };
  const sdk = {
    createAgentSession: vi.fn(async () => ({
      session,
      extensionsResult: { errors: [{ path: "/broken-load.ts", error: "load failed" }] },
    })),
    SessionManager: { open: () => sessionManager },
  };
  return { session, sdk, subscribers };
}

describe("native extension lifecycle", () => {
  it.each(["create", "resume", "fork"] as const)("initializes extensions and preserves diagnostics on %s", async (operation) => {
    const { sdk, session } = fixture();
    const input = { sessionId: "app-extension-test", projectId: "project", cwd: "/project" };
    const options = { sdk };
    const runtime = operation === "create"
      ? await createPublicPiSdkRuntimeFactory(options)(input)
      : operation === "resume"
        ? await createPublicPiSdkRuntimeResumer(options)({ ...input, piSessionId: session.sessionId, sessionFile: "/session.jsonl" })
        : (await createPublicPiSdkRuntimeForker(options)({ ...input, sourcePiSessionId: session.sessionId, sourceSessionFile: "/session.jsonl", piEntryId: "entry" })).runtime;

    expect(session.bindExtensions).toHaveBeenCalledTimes(1);
    expect(await runtime.resolveToolSchemas?.(["initialized"])).toMatchObject({ schemas: { initialized: { description: "initialized tool" } } });
    const events: unknown[] = [];
    const unsubscribe = runtime.onEvent?.(event => events.push(event));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: input.sessionId, type: "error", payload: expect.objectContaining({ code: "extension_load_error", body: expect.stringContaining("load failed") }) }),
      expect.objectContaining({ sessionId: input.sessionId, type: "error", payload: expect.objectContaining({ code: "extension_error", body: expect.stringContaining("startup failed") }) }),
    ]));
    unsubscribe?.();
    const later: unknown[] = [];
    runtime.onEvent?.(event => later.push(event));
    expect(later).toEqual([]);
    await runtime.dispose?.();
  });

  it("disposes a session and its subscription if binding fails", async () => {
    const { sdk, session, subscribers } = fixture();
    session.bindExtensions.mockRejectedValue(new Error("binding failed"));
    await expect(createPublicPiSdkRuntimeFactory({ sdk })({ sessionId: "app", projectId: "p", cwd: "/project" })).rejects.toThrow("binding failed");
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(subscribers.size).toBe(0);
  });
});
