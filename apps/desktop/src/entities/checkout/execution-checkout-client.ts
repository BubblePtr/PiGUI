import type { ExecutionCheckoutGitClient } from "@/entities/checkout/execution-checkout";
import { invoke as invokeRuntime } from "@/shared/runtime";

type InvokeCommand = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export type InvokeExecutionCheckoutGitClientOptions = {
  invoke?: InvokeCommand;
};

export function createInvokeExecutionCheckoutGitClient(
  options: InvokeExecutionCheckoutGitClientOptions = {},
): ExecutionCheckoutGitClient {
  const invoke = options.invoke ?? invokeRuntime;

  return {
    async isGitRepository(repoRoot) {
      try {
        return await invoke<boolean>("is_git_repository", { repoRoot });
      } catch {
        return false;
      }
    },

    async addDetachedWorktree(input) {
      await invoke<void>("add_detached_worktree", { input });
    },
  };
}
