import { mkdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export function resolveChatWorkspaceRoot(dataDir: string) {
  return resolve(dataDir, "chats");
}

export async function ensureChatWorkspaceRoot(dataDir: string) {
  const path = resolveChatWorkspaceRoot(dataDir);
  await mkdir(path, { recursive: true });
  return path;
}

export async function ensureChatWorkspace(dataDir: string, sessionId: string) {
  assertSafeChatSessionId(sessionId);
  const cwd = join(resolveChatWorkspaceRoot(dataDir), sessionId);
  await mkdir(cwd, { recursive: true });
  return cwd;
}

export function isChatWorkspaceCwd(dataDir: string, cwd: string) {
  const root = resolveChatWorkspaceRoot(dataDir);
  const relativeCwd = relative(root, resolve(cwd));
  // relative() would also accept a sibling like "chats-extra" if we used a
  // string prefix on the chats root; reject the root itself and any escape.
  return relativeCwd !== "" && !relativeCwd.startsWith("..") && !isAbsolute(relativeCwd);
}

function assertSafeChatSessionId(sessionId: string) {
  if (
    sessionId.includes("/") ||
    sessionId.includes("\\") ||
    sessionId.includes("\0") ||
    sessionId === "." ||
    sessionId === ".."
  ) {
    throw new Error("sessionId must be a single path segment");
  }
}
