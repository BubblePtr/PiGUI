import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  createExecutionCheckoutManager,
  markExecutionCheckoutCleanupCandidate,
  promoteExecutionCheckout,
} from "./execution-checkout";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];

async function git(cwd: string, args: string[]) {
  const { stdout } = await execFileAsync("git", args, { cwd });

  return stdout.trim();
}

async function pathExists(path: string) {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

async function createMonorepoFixture() {
  const root = await mkdtemp(join(tmpdir(), "pig-checkout-"));
  tempRoots.push(root);
  const repoRoot = join(root, "repo");
  const projectRoot = join(repoRoot, "packages", "web");

  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(repoRoot, "README.md"), "Pig checkout fixture\n");
  await writeFile(join(projectRoot, "package.json"), "{\"name\":\"web\"}\n");
  await git(root, ["init", "--initial-branch=main", "repo"]);
  await git(repoRoot, ["config", "user.name", "Pig Test"]);
  await git(repoRoot, ["config", "user.email", "pig@example.com"]);
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "init"]);

  return {
    root,
    repoRoot,
    projectRoot,
    worktreesRoot: join(root, "pig-managed-worktrees"),
  };
}

describe("Execution Checkout manager", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it("creates a detached Pig-managed worktree for background concurrent Git Sessions", async () => {
    const fixture = await createMonorepoFixture();
    const manager = createExecutionCheckoutManager({
      worktreesRoot: fixture.worktreesRoot,
      gitClient: {
        async isGitRepository(repoRoot) {
          await git(repoRoot, ["rev-parse", "--show-toplevel"]);

          return true;
        },
        async addDetachedWorktree({ repoRoot, checkoutRoot }) {
          await mkdir(dirname(checkoutRoot), { recursive: true });
          await git(repoRoot, ["worktree", "add", "--detach", checkoutRoot, "HEAD"]);
        },
      },
    });

    const checkout = await manager.prepareCheckout({
      sessionId: "session-42",
      strategy: "background-managed",
      project: {
        id: "web",
        repoRoot: fixture.repoRoot,
        projectRoot: fixture.projectRoot,
      },
      now: () => "2026-06-27T08:00:00.000Z",
    });

    expect(checkout).toMatchObject({
      mode: "managed-worktree",
      root: join(fixture.worktreesRoot, "session-42"),
      repoRoot: fixture.repoRoot,
      projectRoot: fixture.projectRoot,
      projectRelativePath: "packages/web",
      executionCheckoutRoot: join(fixture.worktreesRoot, "session-42"),
      diffRoot: join(fixture.worktreesRoot, "session-42"),
      runtimeCwd: join(fixture.worktreesRoot, "session-42", "packages", "web"),
      sessionBound: true,
      disposable: true,
      cleanupCandidate: false,
      permanent: false,
      createdAt: "2026-06-27T08:00:00.000Z",
    });
    await expect(pathExists(join(checkout.runtimeCwd, "package.json"))).resolves.toBe(true);
    await expect(git(fixture.repoRoot, ["worktree", "list", "--porcelain"])).resolves.toContain(
      checkout.executionCheckoutRoot,
    );
  });

  it("keeps foreground or explicit path Sessions on the local checkout", async () => {
    const fixture = await createMonorepoFixture();
    const manager = createExecutionCheckoutManager({
      worktreesRoot: fixture.worktreesRoot,
    });

    const checkout = await manager.prepareCheckout({
      sessionId: "session-local",
      strategy: "foreground-local",
      project: {
        id: "web",
        repoRoot: fixture.repoRoot,
        projectRoot: fixture.projectRoot,
      },
      now: () => "2026-06-27T08:00:00.000Z",
    });

    expect(checkout).toMatchObject({
      mode: "foreground-local",
      root: fixture.repoRoot,
      repoRoot: fixture.repoRoot,
      projectRoot: fixture.projectRoot,
      projectRelativePath: "packages/web",
      executionCheckoutRoot: fixture.repoRoot,
      diffRoot: fixture.repoRoot,
      runtimeCwd: fixture.projectRoot,
      sessionBound: false,
      disposable: false,
      cleanupCandidate: false,
      permanent: true,
    });
  });

  it("retains managed worktrees after completion and only marks disposable ones as cleanup candidates", async () => {
    const fixture = await createMonorepoFixture();
    const manager = createExecutionCheckoutManager({
      worktreesRoot: fixture.worktreesRoot,
      gitClient: {
        async isGitRepository() {
          return true;
        },
        async addDetachedWorktree({ repoRoot, checkoutRoot }) {
          await mkdir(dirname(checkoutRoot), { recursive: true });
          await git(repoRoot, ["worktree", "add", "--detach", checkoutRoot, "HEAD"]);
        },
      },
    });
    const managed = await manager.prepareCheckout({
      sessionId: "session-retained",
      strategy: "background-managed",
      project: {
        id: "web",
        repoRoot: fixture.repoRoot,
        projectRoot: fixture.projectRoot,
      },
      now: () => "2026-06-27T08:00:00.000Z",
    });

    const cleanupCandidate = markExecutionCheckoutCleanupCandidate(managed, {
      occurredAt: "2026-06-27T09:00:00.000Z",
    });
    const permanent = promoteExecutionCheckout(cleanupCandidate, {
      occurredAt: "2026-06-27T10:00:00.000Z",
    });
    const afterArchive = markExecutionCheckoutCleanupCandidate(permanent, {
      occurredAt: "2026-06-27T11:00:00.000Z",
    });

    expect(cleanupCandidate).toMatchObject({
      cleanupCandidate: true,
      cleanupMarkedAt: "2026-06-27T09:00:00.000Z",
      permanent: false,
    });
    await expect(pathExists(managed.root)).resolves.toBe(true);
    expect(permanent).toMatchObject({
      cleanupCandidate: false,
      disposable: false,
      permanent: true,
      promotedAt: "2026-06-27T10:00:00.000Z",
    });
    expect(afterArchive.cleanupCandidate).toBe(false);
  });
});
