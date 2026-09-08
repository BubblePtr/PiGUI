import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { TreeList, type TreeListItemData } from "@astryxdesign/core/TreeList";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  listSessionDirectory,
  readSessionFile,
  type SessionDirectoryEntry,
  type SessionFileContent,
} from "@/entities/session/session-files";
import { FileIcon, FolderClosed, RefreshCw } from "@/shared/ui/icons";
import { SessionSurfaceBar } from "@/shared/ui/session-dock/surface-bar";

/**
 * Files surface content: a read-only browser of the Session checkout. The
 * tree lists the diff root and loads directories on demand; the preview
 * renders the selected file through the same renderer the Changes surface
 * uses for patches. No editing and no "open externally" — ADR-0007 unfroze the
 * surface only as far as reading goes.
 */

const SessionFileViewer = lazy(
  () => import("@/entities/session/session-file-viewer"),
);

type DirectoryState =
  | { status: "loading" }
  | { status: "loaded"; entries: SessionDirectoryEntry[]; truncated: boolean }
  | { status: "error"; message: string };

type PreviewState =
  | { status: "loading"; path: string }
  | { status: "loaded"; path: string; content: SessionFileContent }
  | { status: "error"; path: string; message: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Stands in for a directory's children until they are loaded. TreeList keeps
 * expansion state to itself, so the only signal that a directory was opened —
 * by row click, chevron, or keyboard — is this placeholder being rendered.
 * Its mount is what requests the listing.
 */
function DirectoryPlaceholder({
  path,
  onMount,
}: {
  path: string;
  onMount: (path: string) => void;
}) {
  useEffect(() => {
    onMount(path);
  }, [onMount, path]);

  return <span className="text-muted">Loading…</span>;
}

type Props = {
  sessionId: string;
};

export function SessionFilesPanel(props: Props) {
  return <FilesSessionContent key={props.sessionId} {...props} />;
}

function FilesSessionContent({ sessionId }: Props) {
  const [rootName, setRootName] = useState<string | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [directories, setDirectories] = useState<Map<string, DirectoryState>>(
    () => new Map(),
  );
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // A refresh drops every cached listing; responses from the previous
  // generation must not resurrect them.
  const generationRef = useRef(0);
  // Paths whose listing was requested in the current generation, so a
  // re-mounted placeholder (StrictMode, re-expansion) never double-fetches.
  const requestedRef = useRef(new Set<string>());
  const previewRequestRef = useRef(0);

  const loadDirectory = useCallback(
    async (path: string) => {
      const generation = generationRef.current;
      setDirectories((current) => {
        const next = new Map(current);
        next.set(path, { status: "loading" });
        return next;
      });

      try {
        const listing = await listSessionDirectory(sessionId, path);
        if (generation !== generationRef.current) return;
        if (path === "") {
          setRootName(listing.rootName);
          setRootError(null);
        }
        setDirectories((current) => {
          const next = new Map(current);
          next.set(path, {
            status: "loaded",
            entries: listing.entries,
            truncated: listing.truncated,
          });
          return next;
        });
      } catch (error) {
        if (generation !== generationRef.current) return;
        const message = errorMessage(error, "The directory could not be listed.");
        if (path === "") {
          setRootError(message);
        }
        setDirectories((current) => {
          const next = new Map(current);
          next.set(path, { status: "error", message });
          return next;
        });
      }
    },
    [sessionId],
  );

  const ensureDirectory = useCallback(
    (path: string) => {
      if (requestedRef.current.has(path)) return;
      requestedRef.current.add(path);
      void loadDirectory(path);
    },
    [loadDirectory],
  );

  const openFile = useCallback(
    async (path: string) => {
      const request = ++previewRequestRef.current;
      setPreview({ status: "loading", path });

      try {
        const content = await readSessionFile(sessionId, path);
        if (request !== previewRequestRef.current) return;
        setPreview({ status: "loaded", path, content });
      } catch (error) {
        if (request !== previewRequestRef.current) return;
        setPreview({
          status: "error",
          path,
          message: errorMessage(error, "The file could not be read."),
        });
      }
    },
    [sessionId],
  );

  const refresh = useCallback(() => {
    generationRef.current += 1;
    requestedRef.current = new Set([""]);
    setRootError(null);
    setDirectories(new Map());
    void loadDirectory("");
    if (preview) {
      void openFile(preview.path);
    }
  }, [loadDirectory, openFile, preview]);

  useEffect(() => {
    ensureDirectory("");
  }, [ensureDirectory]);

  const selectedPath = preview?.path ?? null;

  const treeItems = useMemo(() => {
    const toItems = (path: string): TreeListItemData[] => {
      const state = directories.get(path);
      if (!state || state.status === "loading") {
        return [
          {
            id: `${path}/…loading`,
            label: <DirectoryPlaceholder path={path} onMount={ensureDirectory} />,
            isDisabled: true,
          },
        ];
      }
      if (state.status === "error") {
        return [
          {
            id: `${path}/…error`,
            label: <span className="text-danger">{state.message}</span>,
            isDisabled: true,
          },
        ];
      }

      const items: TreeListItemData[] = state.entries.map((entry) => {
        if (entry.kind === "directory") {
          return {
            id: entry.path,
            label: entry.name,
            startContent: <FolderClosed className="size-4 text-muted" />,
            children: toItems(entry.path),
          };
        }
        if (entry.kind === "file") {
          return {
            id: entry.path,
            label: entry.name,
            startContent: <FileIcon className="size-4 text-muted" />,
            isSelected: entry.path === selectedPath,
            onClick: () => void openFile(entry.path),
          };
        }
        // Symlinks and special files are listed so the tree is honest about
        // the checkout, but there is nothing safe to preview behind them.
        return {
          id: entry.path,
          label: entry.name,
          description: entry.kind === "symlink" ? "Symlink" : undefined,
          startContent: <FileIcon className="size-4 text-muted" />,
          isDisabled: true,
        };
      });

      if (state.truncated) {
        items.push({
          id: `${path}/…truncated`,
          label: <span className="text-muted">Listing truncated</span>,
          isDisabled: true,
        });
      }
      return items;
    };

    return toItems("");
  }, [directories, ensureDirectory, openFile, selectedPath]);

  const root = directories.get("");
  const rootLoading = !root || root.status === "loading";

  return (
    <section aria-label="Session files" className="flex h-full min-h-0 flex-col pb-2">
      <SessionSurfaceBar
        actions={
          <IconButton
            className="pigui-pressable"
            icon={<RefreshCw className={`size-4 ${rootLoading ? "animate-spin" : ""}`} />}
            isDisabled={rootLoading}
            label="Refresh Session files"
            size="sm"
            tooltip="Refresh files"
            variant="ghost"
            onClick={refresh}
          />
        }
      >
        <p
          className="min-w-0 truncate pl-2 text-xs text-muted"
          title={selectedPath ?? rootName ?? undefined}
        >
          {selectedPath ?? rootName ?? ""}
        </p>
      </SessionSurfaceBar>

      {/* px-2 is the flush surface's inset, so the tree border lands on the
          same column as the bar's leading control. */}
      {rootLoading && !rootError ? (
        <div className="mt-3 grid gap-2 px-2" aria-label="Loading Session files">
          <div className="h-8 animate-pulse motion-reduce:animate-none rounded-md bg-default/40" />
          <div className="h-24 animate-pulse motion-reduce:animate-none rounded-md bg-default/30" />
        </div>
      ) : rootError ? (
        <div
          className="mx-2 mt-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-3"
          role="alert"
        >
          <p className="text-sm text-danger">{rootError}</p>
          <Button
            className="mt-3"
            label="Retry"
            size="sm"
            variant="secondary"
            onClick={refresh}
          />
        </div>
      ) : (
        <div className="mt-3 grid min-h-0 min-w-0 flex-1 gap-3 px-2 md:grid-cols-[14rem_minmax(0,1fr)]">
          <div className="min-w-0 overflow-y-auto rounded-md border border-default/70 bg-surface p-1.5">
            <TreeList
              density="compact"
              header={<span className="sr-only">Session files</span>}
              items={treeItems}
              variant="noGuides"
            />
          </div>
          <div className="min-h-0 min-w-0 overflow-y-auto">
            <FilePreview preview={preview} onRetry={openFile} />
          </div>
        </div>
      )}
    </section>
  );
}

function FilePreview({
  preview,
  onRetry,
}: {
  preview: PreviewState | null;
  onRetry: (path: string) => void;
}) {
  if (!preview) {
    return <p className="text-sm leading-6 text-muted">Select a file to preview it.</p>;
  }

  if (preview.status === "loading") {
    return (
      <div className="grid gap-2" aria-label="Loading file">
        <div className="h-8 animate-pulse motion-reduce:animate-none rounded-md bg-default/40" />
        <div className="h-40 animate-pulse motion-reduce:animate-none rounded-md bg-default/30" />
      </div>
    );
  }

  if (preview.status === "error") {
    return (
      <div
        className="rounded-md border border-danger/40 bg-danger/5 px-3 py-3"
        role="alert"
      >
        <p className="text-sm text-danger">{preview.message}</p>
        <Button
          className="mt-3"
          label="Retry"
          size="sm"
          variant="secondary"
          onClick={() => onRetry(preview.path)}
        />
      </div>
    );
  }

  const { content } = preview;

  if (content.binary) {
    return (
      <p className="rounded-md border border-default/70 bg-surface px-3 py-3 text-sm text-muted">
        Binary file. A preview is not available.
      </p>
    );
  }

  if (content.content.length === 0) {
    return (
      <p className="rounded-md border border-default/70 bg-surface px-3 py-3 text-sm text-muted">
        This file is empty.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {content.truncated ? (
        <p className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-foreground">
          Only the first part of this file is shown. It exceeds the preview limit.
        </p>
      ) : null}
      <Suspense
        fallback={
          <div
            className="h-40 animate-pulse motion-reduce:animate-none rounded-md bg-default/30"
            aria-label="Loading file renderer"
          />
        }
      >
        <SessionFileViewer contents={content.content} path={content.path} />
      </Suspense>
    </div>
  );
}
