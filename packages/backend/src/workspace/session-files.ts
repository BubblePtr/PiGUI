import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
  SessionDirectoryEntry,
  SessionDirectoryEntryKind,
  SessionDirectoryListing,
  SessionFileContent,
} from "@pigui/core";

const DEFAULT_MAX_ENTRIES = 2000;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const BINARY_SNIFF_BYTES = 8 * 1024;

export type SessionFilesReaderOptions = {
  maxEntries?: number;
  maxFileBytes?: number;
};

export type ListSessionDirectoryInput = {
  sessionId: string;
  diffRoot: string;
  /** Diff-root-relative path; "" lists the root. */
  path: string;
};

export type ReadSessionFileInput = {
  sessionId: string;
  diffRoot: string;
  path: string;
};

export type SessionFilesReader = {
  listDirectory(input: ListSessionDirectoryInput): Promise<SessionDirectoryListing>;
  readFile(input: ReadSessionFileInput): Promise<SessionFileContent>;
};

function isInside(parent: string, child: string) {
  const path = relative(parent, child);

  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  );
}

function assertSafeRelativePath(path: string) {
  if (
    path.includes("\0") ||
    isAbsolute(path) ||
    path.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`Session file path "${path}" is invalid.`);
  }
}

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}

/**
 * Resolves a renderer-supplied relative path to a real filesystem path that
 * is guaranteed to sit under the (real) diff root. The lexical check catches
 * `..` tricks; the realpath check catches symlinks that point outside the
 * checkout, which a lexical check cannot see.
 */
async function resolveInsideRoot(diffRoot: string, path: string) {
  assertSafeRelativePath(path);
  const root = await realpath(diffRoot);
  const lexical = resolve(root, path);

  if (!isInside(root, lexical)) {
    throw new Error(`Session file path "${path}" is outside the diff root.`);
  }

  const target = await realpath(lexical);

  if (!isInside(root, target)) {
    throw new Error(`Session file path "${path}" is outside the diff root.`);
  }

  return { root, target, relativePath: toPosixPath(relative(root, lexical)) };
}

function entryKind(dirent: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): SessionDirectoryEntryKind {
  if (dirent.isSymbolicLink()) return "symlink";
  if (dirent.isDirectory()) return "directory";
  if (dirent.isFile()) return "file";
  return "other";
}

function compareEntries(a: SessionDirectoryEntry, b: SessionDirectoryEntry) {
  if (a.kind !== b.kind) {
    if (a.kind === "directory") return -1;
    if (b.kind === "directory") return 1;
  }

  return a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
    a.name.localeCompare(b.name, "en");
}

function looksBinary(bytes: Buffer) {
  return bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

export function createNodeSessionFilesReader(
  options: SessionFilesReaderOptions = {},
): SessionFilesReader {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  return {
    async listDirectory(input) {
      const { root, target, relativePath } = await resolveInsideRoot(
        input.diffRoot,
        input.path,
      );
      const targetStat = await lstat(target);

      if (!targetStat.isDirectory()) {
        throw new Error(`Session path "${input.path}" is not a directory.`);
      }

      const dirents = await readdir(target, { withFileTypes: true });
      const entries: SessionDirectoryEntry[] = [];

      for (const dirent of dirents) {
        if (dirent.name === ".git") continue;
        const kind = entryKind(dirent);
        const size =
          kind === "file" ? (await stat(join(target, dirent.name))).size : null;

        entries.push({
          name: dirent.name,
          path: relativePath ? `${relativePath}/${dirent.name}` : dirent.name,
          kind,
          size,
        });
      }

      entries.sort(compareEntries);

      return {
        sessionId: input.sessionId,
        path: relativePath,
        rootName: basename(root),
        entries: entries.slice(0, maxEntries),
        truncated: entries.length > maxEntries,
      };
    },

    async readFile(input) {
      const { target, relativePath } = await resolveInsideRoot(
        input.diffRoot,
        input.path,
      );
      const targetStat = await stat(target);

      if (!targetStat.isFile()) {
        throw new Error(`Session path "${input.path}" is not a file.`);
      }

      const size = targetStat.size;
      const handle = await open(target, "r");
      let bytes: Buffer;

      try {
        const buffer = Buffer.alloc(Math.min(size, maxFileBytes));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        bytes = buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }

      const base = { sessionId: input.sessionId, path: relativePath, size };

      if (looksBinary(bytes)) {
        return { ...base, content: "", truncated: false, binary: true };
      }

      if (size <= bytes.length) {
        return {
          ...base,
          content: bytes.toString("utf8"),
          truncated: false,
          binary: false,
        };
      }

      // Cut on a line boundary so a truncated view never ends mid-line (or
      // mid-multibyte-character). Fall back to the raw limit for files with
      // no newline at all, since an empty preview would be worse.
      const lastNewline = bytes.lastIndexOf(0x0a);
      const cut = lastNewline >= 0 ? bytes.subarray(0, lastNewline + 1) : bytes;

      return {
        ...base,
        content: cut.toString("utf8"),
        truncated: true,
        binary: false,
      };
    },
  };
}
