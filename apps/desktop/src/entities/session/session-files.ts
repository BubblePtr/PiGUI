import { invoke } from "@/shared/runtime";
import type { SessionDirectoryListing, SessionFileContent } from "@pigui/core";

export type {
  SessionDirectoryEntry,
  SessionDirectoryEntryKind,
  SessionDirectoryListing,
  SessionFileContent,
} from "@pigui/core";

/** Paths are diff-root-relative; "" lists the root itself. */
export async function listSessionDirectory(sessionId: string, path = "") {
  return invoke<SessionDirectoryListing>("list_session_directory", {
    sessionId,
    path,
  });
}

export async function readSessionFile(sessionId: string, path: string) {
  return invoke<SessionFileContent>("read_session_file", { sessionId, path });
}
