import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureChatWorkspace, isChatWorkspaceCwd } from "./chat-workspace";

describe("chat workspace", () => {
  it("creates an idempotent chat cwd and rejects sibling prefix matches", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "pigui-chats-"));
    const sessionId = "session-abc";
    const expected = join(dataDir, "chats", sessionId);

    const first = await ensureChatWorkspace(dataDir, sessionId);
    const second = await ensureChatWorkspace(dataDir, sessionId);

    expect(first).toBe(expected);
    expect(second).toBe(expected);
    expect((await stat(expected)).isDirectory()).toBe(true);
    expect(isChatWorkspaceCwd(dataDir, expected)).toBe(true);
    expect(isChatWorkspaceCwd(dataDir, join(dataDir, "chats"))).toBe(false);
    expect(isChatWorkspaceCwd(dataDir, join(dataDir, "chats-extra", sessionId))).toBe(false);
  });

  it("rejects sessionIds that could escape the chats root", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "pigui-chats-"));

    await expect(ensureChatWorkspace(dataDir, "../escape")).rejects.toThrow();
    await expect(ensureChatWorkspace(dataDir, "nested/id")).rejects.toThrow();
    await expect(ensureChatWorkspace(dataDir, "nested\\id")).rejects.toThrow();
    await expect(ensureChatWorkspace(dataDir, "nul\0id")).rejects.toThrow();
    await expect(ensureChatWorkspace(dataDir, ".")).rejects.toThrow();
    await expect(ensureChatWorkspace(dataDir, "..")).rejects.toThrow();
  });
});
