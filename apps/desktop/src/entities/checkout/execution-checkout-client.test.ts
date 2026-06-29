import { describe, expect, it } from "vitest";
import { createInvokeExecutionCheckoutGitClient } from "@/entities/checkout/execution-checkout-client";

describe("Invoke Execution Checkout Git client", () => {
  it("delegates Git repository checks and detached worktree creation through invoke", async () => {
    const invocations: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke = async <T,>(command: string, args?: Record<string, unknown>) => {
      invocations.push({ command, args });

      if (command === "is_git_repository") {
        return true as T;
      }

      return undefined as T;
    };
    const client = createInvokeExecutionCheckoutGitClient({ invoke });

    await expect(client.isGitRepository("/Users/void/code/opensource/Pig")).resolves.toBe(true);
    await expect(
      client.addDetachedWorktree({
        repoRoot: "/Users/void/code/opensource/Pig",
        checkoutRoot: "/Users/void/code/opensource/.pig-worktrees/Pig/session-1",
        sessionId: "session-1",
      }),
    ).resolves.toBeUndefined();
    expect(invocations).toEqual([
      {
        command: "is_git_repository",
        args: {
          repoRoot: "/Users/void/code/opensource/Pig",
        },
      },
      {
        command: "add_detached_worktree",
        args: {
          input: {
            repoRoot: "/Users/void/code/opensource/Pig",
            checkoutRoot: "/Users/void/code/opensource/.pig-worktrees/Pig/session-1",
            sessionId: "session-1",
          },
        },
      },
    ]);
  });
});
