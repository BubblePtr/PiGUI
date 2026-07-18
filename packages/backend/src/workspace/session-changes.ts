import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  SessionChangedFile,
  SessionChangedFileKind,
  SessionChanges,
} from "@pigui/core";

const MAX_FILES = 200;
const MAX_PATCH_BYTES = 512 * 1024;
const MAX_TOTAL_PATCH_BYTES = 2 * 1024 * 1024;
const MAX_STATUS_BYTES = 8 * 1024 * 1024;
const GIT_TIMEOUT_MS = 15_000;

export type ReadSessionChangesInput = {
  sessionId: string;
  checkoutRoot: string;
  diffRoot: string;
};

export type SessionChangesReader = {
  read(input: ReadSessionChangesInput): Promise<SessionChanges>;
};

type GitResult = {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
};

type StatusEntry = {
  repoPath: string;
  previousRepoPath?: string;
  kind: SessionChangedFileKind;
  staged: boolean;
  unstaged: boolean;
};

class GitOutputLimitError extends Error {}

function isInside(parent: string, child: string) {
  const path = relative(parent, child);

  return (
    path === "" ||
    (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))
  );
}

function assertSafeGitPath(path: string) {
  if (
    !path ||
    path.includes("\0") ||
    isAbsolute(path) ||
    path.split("/").includes("..")
  ) {
    throw new Error("Git returned an invalid changed-file path.");
  }

  const normalized = resolve("/", path);

  if (!isInside("/", normalized) || normalized === "/") {
    throw new Error("Git returned a changed-file path outside the repository.");
  }
}

function literalPathspec(path: string) {
  assertSafeGitPath(path);
  return `:(top,literal)${path}`;
}

function splitPrefix(record: string, fieldCount: number) {
  const fields: string[] = [];
  let cursor = 0;

  for (let index = 0; index < fieldCount; index += 1) {
    const separator = record.indexOf(" ", cursor);

    if (separator === -1) {
      throw new Error("Git returned malformed porcelain status output.");
    }

    fields.push(record.slice(cursor, separator));
    cursor = separator + 1;
  }

  return { fields, remainder: record.slice(cursor) };
}

function kindFromStatus(code: string): SessionChangedFileKind {
  if (code.includes("U") || code === "AA" || code === "DD") {
    return "conflicted";
  }
  if (code.includes("R")) return "renamed";
  if (code.includes("C")) return "copied";
  if (code.includes("D")) return "deleted";
  if (code.includes("A")) return "added";
  if (code.includes("T")) return "type-changed";
  return "modified";
}

function statusFlags(code: string) {
  return {
    staged: code[0] !== ".",
    unstaged: code[1] !== ".",
  };
}

function parseGitStatus(output: Buffer): StatusEntry[] {
  const records = output.toString("utf8").split("\0");
  const entries: StatusEntry[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];

    if (!record || record.startsWith("# ") || record.startsWith("! ")) {
      continue;
    }

    if (record.startsWith("? ")) {
      const repoPath = record.slice(2);
      assertSafeGitPath(repoPath);
      entries.push({
        repoPath,
        kind: "untracked",
        staged: false,
        unstaged: true,
      });
      continue;
    }

    if (record.startsWith("1 ")) {
      const { fields, remainder: repoPath } = splitPrefix(record, 8);
      const code = fields[1] ?? "..";
      assertSafeGitPath(repoPath);
      entries.push({
        repoPath,
        kind: kindFromStatus(code),
        ...statusFlags(code),
      });
      continue;
    }

    if (record.startsWith("2 ")) {
      const { fields, remainder: repoPath } = splitPrefix(record, 9);
      const previousRepoPath = records[index + 1];

      if (!previousRepoPath) {
        throw new Error("Git returned a rename without its original path.");
      }

      index += 1;
      const code = fields[1] ?? "..";
      assertSafeGitPath(repoPath);
      assertSafeGitPath(previousRepoPath);
      entries.push({
        repoPath,
        previousRepoPath,
        kind: kindFromStatus(code),
        ...statusFlags(code),
      });
      continue;
    }

    if (record.startsWith("u ")) {
      const { remainder: repoPath } = splitPrefix(record, 10);
      assertSafeGitPath(repoPath);
      entries.push({
        repoPath,
        kind: "conflicted",
        staged: true,
        unstaged: true,
      });
      continue;
    }

    throw new Error("Git returned an unsupported porcelain status record.");
  }

  return entries;
}

async function runGit(input: {
  cwd: string;
  args: string[];
  allowExitCodes?: number[];
  maxStdoutBytes?: number;
}): Promise<GitResult> {
  const allowExitCodes = input.allowExitCodes ?? [0];
  const maxStdoutBytes = input.maxStdoutBytes ?? 1024 * 1024;

  return new Promise((resolveResult, reject) => {
    const child = spawn("git", input.args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        LC_ALL: "C",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;

    const finishWithError = (error: Error) => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(error);
    };
    const timer = setTimeout(() => {
      finishWithError(
        new Error(`Git command timed out: git ${input.args[0] ?? ""}`),
      );
    }, GIT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxStdoutBytes) {
        finishWithError(
          new GitOutputLimitError("Git output exceeded the configured limit."),
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (
        stderr.reduce((total, item) => total + item.byteLength, 0) <
        64 * 1024
      ) {
        stderr.push(chunk);
      }
    });
    child.on("error", finishWithError);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const result = {
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        exitCode: exitCode ?? -1,
      };

      if (!allowExitCodes.includes(result.exitCode)) {
        const detail = result.stderr.toString("utf8").trim();
        reject(new Error(detail || `Git exited with code ${result.exitCode}.`));
        return;
      }

      resolveResult(result);
    });
  });
}

function parseNumstat(output: Buffer) {
  let additions = 0;
  let deletions = 0;
  let binary = false;

  for (const record of output.toString("utf8").split("\0")) {
    if (!record) continue;
    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);

    if (firstTab === -1 || secondTab === -1) continue;
    const added = record.slice(0, firstTab);
    const deleted = record.slice(firstTab + 1, secondTab);

    if (added === "-" || deleted === "-") {
      binary = true;
      continue;
    }

    additions += Number.parseInt(added, 10) || 0;
    deletions += Number.parseInt(deleted, 10) || 0;
  }

  return {
    additions: binary ? null : additions,
    deletions: binary ? null : deletions,
    binary,
  };
}

function scopedPathspec(repositoryRoot: string, diffRoot: string) {
  const path = relative(repositoryRoot, diffRoot);

  return path ? ["--", literalPathspec(path)] : [];
}

function displayPath(repositoryRoot: string, diffRoot: string, repoPath: string) {
  const absolutePath = resolve(repositoryRoot, repoPath);

  if (!isInside(diffRoot, absolutePath)) {
    throw new Error("Git returned a changed-file path outside the Session diff root.");
  }

  return relative(diffRoot, absolutePath) || repoPath;
}

function emptyResult(input: {
  sessionId: string;
  checkoutRoot: string;
  repositoryRoot: string | null;
  state: "clean" | "non-git";
  head?: SessionChanges["head"];
}): SessionChanges {
  return {
    sessionId: input.sessionId,
    state: input.state,
    checkoutRoot: input.checkoutRoot,
    repositoryRoot: input.repositoryRoot,
    generatedAt: new Date().toISOString(),
    head: input.head,
    files: [],
    totals: {
      files: 0,
      additions: 0,
      deletions: 0,
      binaryFiles: 0,
      conflictedFiles: 0,
    },
    truncated: false,
    omittedFileCount: 0,
  };
}

async function readPatch(input: {
  repositoryRoot: string;
  entry: StatusEntry;
  hasHead: boolean;
}) {
  const paths = [input.entry.previousRepoPath, input.entry.repoPath]
    .filter((path): path is string => Boolean(path))
    .map(literalPathspec);
  const untracked = input.entry.kind === "untracked" || !input.hasHead;
  const baseArgs = untracked
    ? [
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--unified=3",
        "--",
        "/dev/null",
        input.entry.repoPath,
      ]
    : [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--find-renames",
        "--no-color",
        "--unified=3",
        "HEAD",
        "--",
        ...paths,
      ];
  const numstatArgs = untracked
    ? [
        "diff",
        "--no-index",
        "--numstat",
        "-z",
        "--",
        "/dev/null",
        input.entry.repoPath,
      ]
    : ["diff", "--numstat", "-z", "--no-renames", "HEAD", "--", ...paths];
  const allowExitCodes = untracked ? [0, 1] : [0];
  const stats = parseNumstat(
    (
      await runGit({
        cwd: input.repositoryRoot,
        args: numstatArgs,
        allowExitCodes,
        maxStdoutBytes: 512 * 1024,
      })
    ).stdout,
  );

  try {
    const patch = (
      await runGit({
        cwd: input.repositoryRoot,
        args: baseArgs,
        allowExitCodes,
        maxStdoutBytes: MAX_PATCH_BYTES,
      })
    ).stdout.toString("utf8");

    return { ...stats, patch: patch || undefined, patchTruncated: false };
  } catch (error) {
    if (error instanceof GitOutputLimitError) {
      return { ...stats, patch: undefined, patchTruncated: true };
    }
    throw error;
  }
}

export function createNodeSessionChangesReader(): SessionChangesReader {
  return {
    async read(input) {
      const checkoutRoot = await realpath(input.checkoutRoot);
      const diffRoot = await realpath(input.diffRoot);

      if (!isInside(checkoutRoot, diffRoot)) {
        throw new Error("Session diff root must be inside its execution checkout.");
      }

      const topLevelResult = await runGit({
        cwd: diffRoot,
        args: ["rev-parse", "--show-toplevel"],
        allowExitCodes: [0, 128],
      });

      if (topLevelResult.exitCode === 128) {
        const detail = topLevelResult.stderr.toString("utf8").trim();

        if (!/not a git repository|not a git work tree/i.test(detail)) {
          throw new Error(detail || "Git could not inspect the Session checkout.");
        }

        return emptyResult({
          sessionId: input.sessionId,
          checkoutRoot,
          repositoryRoot: null,
          state: "non-git",
        });
      }

      const repositoryRoot = await realpath(
        topLevelResult.stdout.toString("utf8").trim(),
      );

      if (!isInside(checkoutRoot, repositoryRoot) || !isInside(repositoryRoot, diffRoot)) {
        throw new Error("Session Git repository must stay inside its execution checkout.");
      }

      const oidResult = await runGit({
        cwd: repositoryRoot,
        args: ["rev-parse", "--verify", "--quiet", "HEAD"],
        allowExitCodes: [0, 1],
      });
      const hasHead = oidResult.exitCode === 0;
      const branchResult = await runGit({
        cwd: repositoryRoot,
        args: ["symbolic-ref", "--quiet", "--short", "HEAD"],
        allowExitCodes: [0, 1],
      });
      const head = {
        oid: hasHead ? oidResult.stdout.toString("utf8").trim() : null,
        branch:
          branchResult.exitCode === 0
            ? branchResult.stdout.toString("utf8").trim()
            : null,
        detached: hasHead && branchResult.exitCode !== 0,
      };
      const status = await runGit({
        cwd: repositoryRoot,
        args: [
          "status",
          "--porcelain=v2",
          "-z",
          "--untracked-files=all",
          ...scopedPathspec(repositoryRoot, diffRoot),
        ],
        maxStdoutBytes: MAX_STATUS_BYTES,
      });
      const allEntries = parseGitStatus(status.stdout);

      if (!allEntries.length) {
        return emptyResult({
          sessionId: input.sessionId,
          checkoutRoot,
          repositoryRoot,
          state: "clean",
          head,
        });
      }

      const entries = allEntries.slice(0, MAX_FILES);
      const files: SessionChangedFile[] = [];
      let patchBytes = 0;

      for (const entry of entries) {
        const display = displayPath(repositoryRoot, diffRoot, entry.repoPath);
        const previousDisplay = entry.previousRepoPath
          ? displayPath(repositoryRoot, diffRoot, entry.previousRepoPath)
          : undefined;
        const diff =
          entry.kind === "conflicted"
            ? {
                additions: null,
                deletions: null,
                binary: false,
                patch: undefined,
                patchTruncated: false,
              }
            : await readPatch({ repositoryRoot, entry, hasHead });
        const nextPatchBytes = diff.patch ? Buffer.byteLength(diff.patch) : 0;
        const exceedsTotalLimit = patchBytes + nextPatchBytes > MAX_TOTAL_PATCH_BYTES;

        if (!exceedsTotalLimit) patchBytes += nextPatchBytes;
        files.push({
          path: display,
          previousPath: previousDisplay,
          kind: entry.kind,
          staged: entry.staged,
          unstaged: entry.unstaged,
          additions: diff.additions,
          deletions: diff.deletions,
          binary: diff.binary,
          patch: exceedsTotalLimit ? undefined : diff.patch,
          patchTruncated: diff.patchTruncated || exceedsTotalLimit,
        });
      }

      const totals = files.reduce(
        (result, file) => ({
          files: result.files + 1,
          additions: result.additions + (file.additions ?? 0),
          deletions: result.deletions + (file.deletions ?? 0),
          binaryFiles: result.binaryFiles + Number(file.binary),
          conflictedFiles:
            result.conflictedFiles + Number(file.kind === "conflicted"),
        }),
        {
          files: 0,
          additions: 0,
          deletions: 0,
          binaryFiles: 0,
          conflictedFiles: 0,
        },
      );

      return {
        sessionId: input.sessionId,
        state: "ready",
        checkoutRoot,
        repositoryRoot,
        generatedAt: new Date().toISOString(),
        head,
        files,
        totals,
        truncated:
          allEntries.length > files.length ||
          files.some((file) => file.patchTruncated),
        omittedFileCount: allEntries.length - files.length,
      };
    },
  };
}
