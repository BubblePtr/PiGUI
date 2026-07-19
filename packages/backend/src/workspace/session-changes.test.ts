import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeSessionChangesReader } from "./session-changes";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function tempDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "pigui-session-changes-"));
  tempDirs.push(directory);
  return directory;
}

async function git(cwd: string, ...args: string[]) {
  await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, LC_ALL: "C" },
  });
}

async function repository() {
  const root = await tempDirectory();

  await git(root, "init");
  await git(root, "config", "user.name", "PiGUI Tests");
  await git(root, "config", "user.email", "pigui@example.test");
  await writeFile(join(root, "tracked.txt"), "before\n", "utf8");
  await writeFile(join(root, "old name.txt"), "rename me\n", "utf8");
  await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  await git(root, "add", ".");
  await git(root, "commit", "-m", "test baseline");

  return root;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("session changes reader", () => {
  it("distinguishes non-Git and clean checkouts", async () => {
    const nonGitRoot = await tempDirectory();
    const cleanRoot = await repository();
    const reader = createNodeSessionChangesReader();

    await expect(
      reader.read({
        sessionId: "non-git",
        checkoutRoot: nonGitRoot,
        diffRoot: nonGitRoot,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        sessionId: "non-git",
        state: "non-git",
        repositoryRoot: null,
        files: [],
      }),
    );
    await expect(
      reader.read({
        sessionId: "clean",
        checkoutRoot: cleanRoot,
        diffRoot: cleanRoot,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        sessionId: "clean",
        state: "clean",
        repositoryRoot: await realpath(cleanRoot),
        head: expect.objectContaining({ oid: expect.any(String) }),
        files: [],
      }),
    );
  });

  it("returns bounded patches and Git status for staged, unstaged, renamed, untracked, and binary files", async () => {
    const root = await repository();
    const reader = createNodeSessionChangesReader();

    await writeFile(join(root, "tracked.txt"), "staged\n", "utf8");
    await git(root, "add", "tracked.txt");
    await appendFile(join(root, "tracked.txt"), "unstaged\n", "utf8");
    await git(root, "mv", "old name.txt", "new name.txt");
    await writeFile(join(root, "untracked file.ts"), "export const value = 1;\n", "utf8");
    await writeFile(join(root, "binary.bin"), Buffer.from([0, 9, 8, 7]));

    const result = await reader.read({
      sessionId: "changed",
      checkoutRoot: root,
      diffRoot: root,
    });

    expect(result.state).toBe("ready");
    expect(result.truncated).toBe(false);
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "tracked.txt",
          kind: "modified",
          staged: true,
          unstaged: true,
          additions: 2,
          deletions: 1,
          patch: expect.stringContaining("+unstaged"),
        }),
        expect.objectContaining({
          path: "new name.txt",
          previousPath: "old name.txt",
          kind: "renamed",
          staged: true,
        }),
        expect.objectContaining({
          path: "untracked file.ts",
          kind: "untracked",
          additions: 1,
          deletions: 0,
          patch: expect.stringContaining("export const value"),
        }),
        expect.objectContaining({
          path: "binary.bin",
          binary: true,
          additions: null,
          deletions: null,
        }),
      ]),
    );
    expect(result.totals).toEqual(
      expect.objectContaining({ files: 4, binaryFiles: 1 }),
    );
  });

  it("scopes changes to the Session diff root", async () => {
    const root = await repository();
    const projectRoot = join(root, "packages", "app");
    await mkdir(projectRoot, { recursive: true });
    await writeFile(join(projectRoot, "inside.ts"), "inside\n", "utf8");
    await writeFile(join(root, "outside.ts"), "outside\n", "utf8");

    const result = await createNodeSessionChangesReader().read({
      sessionId: "scoped",
      checkoutRoot: root,
      diffRoot: projectRoot,
    });

    expect(result.files.map((file) => file.path)).toEqual(["inside.ts"]);
  });

  it("reads changes from a repository without an initial commit", async () => {
    const root = await tempDirectory();
    await git(root, "init");
    await writeFile(join(root, "first.txt"), "first change\n", "utf8");

    const result = await createNodeSessionChangesReader().read({
      sessionId: "unborn",
      checkoutRoot: root,
      diffRoot: root,
    });

    expect(result).toEqual(
      expect.objectContaining({
        state: "ready",
        head: expect.objectContaining({ oid: null, detached: false }),
        files: [
          expect.objectContaining({
            path: "first.txt",
            kind: "untracked",
            additions: 1,
            patch: expect.stringContaining("first change"),
          }),
        ],
      }),
    );
  });

  it("omits oversized patches instead of returning invalid partial patches", async () => {
    const root = await repository();
    await writeFile(join(root, "tracked.txt"), `${"x".repeat(600_000)}\n`, "utf8");

    const result = await createNodeSessionChangesReader().read({
      sessionId: "large",
      checkoutRoot: root,
      diffRoot: root,
    });
    const file = result.files.find((candidate) => candidate.path === "tracked.txt");

    expect(result.truncated).toBe(true);
    expect(file).toEqual(
      expect.objectContaining({ patch: undefined, patchTruncated: true }),
    );
  });

  it("rejects diff roots outside the execution checkout", async () => {
    const checkoutRoot = await tempDirectory();
    const outsideRoot = await repository();

    await expect(
      createNodeSessionChangesReader().read({
        sessionId: "escaped",
        checkoutRoot,
        diffRoot: outsideRoot,
      }),
    ).rejects.toThrow("inside its execution checkout");
  });
});
