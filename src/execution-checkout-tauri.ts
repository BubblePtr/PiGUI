import type { ExecutionCheckoutGitClient } from "./execution-checkout";
import { invoke as invokeTauriRuntime } from "./tauri-runtime";

type InvokeTauriCommand = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export type TauriExecutionCheckoutGitClientOptions = {
  invoke?: InvokeTauriCommand;
};

export function createTauriExecutionCheckoutGitClient(
  options: TauriExecutionCheckoutGitClientOptions = {},
): ExecutionCheckoutGitClient {
  const invoke = options.invoke ?? invokeTauriRuntime;

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
