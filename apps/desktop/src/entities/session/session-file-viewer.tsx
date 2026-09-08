import { DEFAULT_THEMES } from "@pierre/diffs";
import { File } from "@pierre/diffs/react";

export type SessionFileViewerProps = {
  /** Diff-root-relative path; the viewer picks its syntax grammar from it. */
  path: string;
  contents: string;
};

/**
 * Read-only file preview for the Files surface. Same renderer options as the
 * diff viewer so a file looks identical whether it is browsed or reviewed.
 */
export default function SessionFileViewer({ path, contents }: SessionFileViewerProps) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-md border border-default/70 bg-surface"
      data-testid="session-file-viewer"
    >
      <File
        disableWorkerPool
        file={{ name: path, contents }}
        options={{
          disableFileHeader: true,
          overflow: "scroll",
          theme: DEFAULT_THEMES,
          themeType: "light",
        }}
      />
    </div>
  );
}
