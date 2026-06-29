import type { ExecutionCheckout } from "@/entities/runtime/pi-runtime-bridge";
import type { ExecutionCheckoutGitClient } from "@pig/core";

export type { ExecutionCheckoutGitClient } from "@pig/core";

export type ProjectExecutionTarget = {
  id: string;
  repoRoot: string;
  projectRoot: string;
};

export type ExecutionCheckoutStrategy = "foreground-local" | "background-managed";

export type PrepareExecutionCheckoutInput = {
  sessionId: string;
  strategy: ExecutionCheckoutStrategy;
  project: ProjectExecutionTarget;
  now?: () => string;
};

export type ExecutionCheckoutManager = {
  prepareCheckout(input: PrepareExecutionCheckoutInput): Promise<ExecutionCheckout>;
};

export type ExecutionCheckoutManagerOptions = {
  worktreesRoot?: string;
  gitClient?: ExecutionCheckoutGitClient;
};

export type ExecutionCheckoutLifecycleEvent = {
  occurredAt: string;
};

function trimTrailingSlash(path: string) {
  if (path === "/") {
    return path;
  }

  return path.replace(/\/+$/, "");
}

function normalizePath(path: string) {
  const absolute = path.startsWith("/");
  const parts = path.split("/").filter(Boolean);
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (part === ".") {
      continue;
    }

    if (part === "..") {
      normalizedParts.pop();
      continue;
    }

    normalizedParts.push(part);
  }

  const normalized = normalizedParts.join("/");

  if (absolute) {
    return `/${normalized}`;
  }

  return normalized || ".";
}

function joinPaths(...parts: string[]) {
  const [first = "", ...rest] = parts;
  const absolute = first.startsWith("/");
  const joined = [first, ...rest]
    .filter((part) => part.length > 0)
    .join("/")
    .replace(/\/+/g, "/");

  return normalizePath(absolute && !joined.startsWith("/") ? `/${joined}` : joined);
}

function parentPath(path: string) {
  const normalized = trimTrailingSlash(normalizePath(path));
  const index = normalized.lastIndexOf("/");

  if (index <= 0) {
    return "/";
  }

  return normalized.slice(0, index);
}

function basename(path: string) {
  const normalized = trimTrailingSlash(normalizePath(path));
  const index = normalized.lastIndexOf("/");

  return index === -1 ? normalized : normalized.slice(index + 1);
}

function relativePathInside(parent: string, child: string) {
  const normalizedParent = trimTrailingSlash(normalizePath(parent));
  const normalizedChild = trimTrailingSlash(normalizePath(child));

  if (normalizedChild === normalizedParent) {
    return ".";
  }

  const prefix = `${normalizedParent}/`;

  if (!normalizedChild.startsWith(prefix)) {
    throw new Error(`Project root must be inside repo root: ${normalizedChild}`);
  }

  return normalizedChild.slice(prefix.length);
}

function checkoutRuntimeCwd(executionCheckoutRoot: string, projectRelativePath: string) {
  if (projectRelativePath === ".") {
    return executionCheckoutRoot;
  }

  return joinPaths(executionCheckoutRoot, projectRelativePath);
}

function sanitizeSessionId(sessionId: string) {
  return sessionId.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function defaultWorktreesRoot(repoRoot: string) {
  return joinPaths(parentPath(repoRoot), ".pig-worktrees", basename(repoRoot));
}

function localCheckout(input: {
  project: ProjectExecutionTarget;
  projectRelativePath: string;
  now: () => string;
}): ExecutionCheckout {
  const repoRoot = trimTrailingSlash(normalizePath(input.project.repoRoot));
  const projectRoot = trimTrailingSlash(normalizePath(input.project.projectRoot));

  return {
    mode: "foreground-local",
    root: repoRoot,
    repoRoot,
    projectRoot,
    projectRelativePath: input.projectRelativePath,
    executionCheckoutRoot: repoRoot,
    diffRoot: repoRoot,
    runtimeCwd: projectRoot,
    sessionBound: false,
    disposable: false,
    cleanupCandidate: false,
    permanent: true,
    createdAt: input.now(),
  };
}

function managedCheckout(input: {
  project: ProjectExecutionTarget;
  sessionId: string;
  worktreesRoot: string;
  projectRelativePath: string;
  now: () => string;
}): ExecutionCheckout {
  const repoRoot = trimTrailingSlash(normalizePath(input.project.repoRoot));
  const projectRoot = trimTrailingSlash(normalizePath(input.project.projectRoot));
  const executionCheckoutRoot = joinPaths(input.worktreesRoot, sanitizeSessionId(input.sessionId));

  return {
    mode: "managed-worktree",
    root: executionCheckoutRoot,
    repoRoot,
    projectRoot,
    projectRelativePath: input.projectRelativePath,
    executionCheckoutRoot,
    diffRoot: executionCheckoutRoot,
    runtimeCwd: checkoutRuntimeCwd(executionCheckoutRoot, input.projectRelativePath),
    sessionBound: true,
    disposable: true,
    cleanupCandidate: false,
    permanent: false,
    createdAt: input.now(),
  };
}

export function createExecutionCheckoutManager(
  options: ExecutionCheckoutManagerOptions = {},
): ExecutionCheckoutManager {
  return {
    async prepareCheckout(input) {
      const now = input.now ?? (() => new Date().toISOString());
      const project = {
        ...input.project,
        repoRoot: trimTrailingSlash(normalizePath(input.project.repoRoot)),
        projectRoot: trimTrailingSlash(normalizePath(input.project.projectRoot)),
      };
      const projectRelativePath = relativePathInside(project.repoRoot, project.projectRoot);

      if (input.strategy === "foreground-local") {
        return localCheckout({ project, projectRelativePath, now });
      }

      const canUseManagedWorktree = options.gitClient
        ? await options.gitClient.isGitRepository(project.repoRoot)
        : false;

      if (!canUseManagedWorktree) {
        return localCheckout({ project, projectRelativePath, now });
      }

      const checkout = managedCheckout({
        project,
        sessionId: input.sessionId,
        worktreesRoot: options.worktreesRoot ?? defaultWorktreesRoot(project.repoRoot),
        projectRelativePath,
        now,
      });

      await options.gitClient?.addDetachedWorktree({
        repoRoot: project.repoRoot,
        checkoutRoot: checkout.executionCheckoutRoot ?? checkout.root,
        sessionId: input.sessionId,
      });

      return checkout;
    },
  };
}

export function markExecutionCheckoutCleanupCandidate(
  checkout: ExecutionCheckout,
  event: ExecutionCheckoutLifecycleEvent,
): ExecutionCheckout {
  if (checkout.permanent || checkout.mode === "foreground-local") {
    return {
      ...checkout,
      cleanupCandidate: false,
    };
  }

  return {
    ...checkout,
    cleanupCandidate: true,
    cleanupMarkedAt: event.occurredAt,
  };
}

export function promoteExecutionCheckout(
  checkout: ExecutionCheckout,
  event: ExecutionCheckoutLifecycleEvent,
): ExecutionCheckout {
  return {
    ...checkout,
    disposable: false,
    cleanupCandidate: false,
    permanent: true,
    promotedAt: event.occurredAt,
  };
}
