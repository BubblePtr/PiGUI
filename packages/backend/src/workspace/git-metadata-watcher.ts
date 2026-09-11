import { execFile } from "node:child_process";
import fs from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
type CheckoutWatch = { sessions: Set<string>; ready: Promise<void>; needsDiscovery: () => boolean; close: () => void };

// Roots are canonical checkout identities supplied by the invalidation scheduler.
export function createGitMetadataWatchers(invalidate: (checkoutId: string) => void) {
  const sessions = new Map<string, string>();
  const checkouts = new Map<string, CheckoutWatch>();

  function remove(sessionId: string) {
    const root = sessions.get(sessionId);
    if (!root) return;
    sessions.delete(sessionId);
    const checkout = checkouts.get(root)!;
    checkout.sessions.delete(sessionId);
    if (checkout.sessions.size === 0) {
      checkout.close();
      checkouts.delete(root);
    }
  }

  return {
    associate(sessionId: string, root: string) {
      if (sessions.get(sessionId) === root && !checkouts.get(root)!.needsDiscovery()) {
        return checkouts.get(root)!.ready;
      }
      remove(sessionId);
      let checkout = checkouts.get(root);
      if (!checkout || checkout.needsDiscovery()) {
        checkout?.close();
        const watcher = watchCheckout(root, () => invalidate(root));
        checkout = { sessions: checkout?.sessions ?? new Set(), ...watcher };
        checkouts.set(root, checkout);
      }
      sessions.set(sessionId, root);
      checkout.sessions.add(sessionId);
      return checkout.ready;
    },
    remove,
    dispose() {
      checkouts.forEach((checkout) => checkout.close());
      checkouts.clear();
      sessions.clear();
    },
  };
}

function watchCheckout(root: string, invalidate: () => void) {
  let closed = false;
  let discoveryFailed = false;
  let queued = false;
  const handles = new Map<string, { handle: fs.FSWatcher; identity: string }>();
  let targets: string[] = [];

  function changed() {
    if (closed || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (closed) return;
      reconcile();
      invalidate();
    });
  }

  function reconcile() {
    const directories = new Map<string, Set<string> | null>();
    function addTarget(target: string) {
      let directory = dirname(target);
      let name = basename(target);
      // Keep the nearest live ancestor so a removed directory can recover
      // through a filesystem event, without a retry poller.
      while (!fs.existsSync(directory) && dirname(directory) !== directory) {
        name = basename(directory);
        directory = dirname(directory);
      }
      if (directories.get(directory) === null) return;
      const names = directories.get(directory) ?? new Set<string>();
      names.add(name);
      directories.set(directory, names);
    }
    function addRefs(directory: string) {
      try {
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        directories.set(directory, null);
        for (const entry of entries) {
          if (entry.isDirectory()) addRefs(resolve(directory, entry.name));
        }
      } catch {
        // Refs can disappear while Git prunes or packs them.
      }
    }
    for (const target of targets) {
      addTarget(target);
      // Watching the containing directory's parent also catches inode replacement.
      addTarget(dirname(target));
    }
    addRefs(targets[2]!);
    for (const [directory, entry] of handles) {
      if (!directories.has(directory)) {
        entry.handle.close();
        handles.delete(directory);
      }
    }
    for (const [directory, names] of directories) {
      try {
        const stat = fs.statSync(directory);
        const identity = `${stat.dev}:${stat.ino}`;
        const previous = handles.get(directory);
        if (previous?.identity === identity) continue;
        previous?.handle.close();
        handles.delete(directory);
        const handle = fs.watch(directory, { persistent: false }, (_event, filename) => {
          if (filename === null || names === null || names.has(filename.toString())) changed();
        });
        handles.set(directory, { handle, identity });
        handle.on("error", () => {
          handle.close();
          if (handles.get(directory)?.handle === handle) handles.delete(directory);
          changed();
        });
      } catch {
        // An ancestor subscription remains when a target vanishes mid-rebuild.
      }
    }
  }

  const ready = (async () => {
    try {
      const { stdout } = await exec("git", ["-C", root, "rev-parse", "--git-path", "HEAD", "--git-path", "index", "--git-path", "refs", "--git-path", "packed-refs"], { env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
      targets = stdout.trim().split("\n").map((path) => resolve(root, path));
    } catch {
      // A later association (resume) retries once the checkout exists again.
      discoveryFailed = true;
      return;
    }
    if (!closed) reconcile();
  })();
  return {
    ready,
    needsDiscovery: () => discoveryFailed,
    close() {
      closed = true;
      handles.forEach(({ handle }) => handle.close());
      handles.clear();
    },
  };
}
