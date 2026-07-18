import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createNodeExecutionCheckoutGitClient } from "./execution-checkout";

function git(cwd: string, args: string[]) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

async function createRepo() {
  const tempDir = mkdtempSync(join(tmpdir(), "pig-git-"));
  const repoRoot = join(tempDir, "repo");

  await mkdir(repoRoot);
  await writeFile(join(repoRoot, "README.md"), "fixture\n");
  git(tempDir, ["init", "--initial-branch=main", "repo"]);
  git(repoRoot, ["config", "user.name", "Pig Test"]);
  git(repoRoot, ["config", "user.email", "pig@example.com"]);
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "init"]);

  return { tempDir, repoRoot };
}

describe("backend execution checkout git client", () => {
  it("detects Git repositories and creates detached worktrees", async () => {
    const { tempDir, repoRoot } = await createRepo();
    const checkoutRoot = join(tempDir, "pig-worktrees", "session-1");
    const client = createNodeExecutionCheckoutGitClient();

    await expect(client.isGitRepository(repoRoot)).resolves.toBe(true);
    await expect(client.isGitRepository(join(tempDir, "not-a-repo"))).resolves.toBe(false);
    await expect(
      client.addDetachedWorktree({
        repoRoot,
        checkoutRoot,
        sessionId: "session-1",
      }),
    ).resolves.toBeUndefined();

    const worktrees = execFileSync("git", ["-C", repoRoot, "worktree", "list", "--porcelain"], {
      encoding: "utf8",
    });

    expect(worktrees).toContain(checkoutRoot);
    expect(execFileSync("git", ["-C", checkoutRoot, "status", "--short"], {
      encoding: "utf8",
    })).toBe("");
  });
});
