import { DEFAULT_THEMES, parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useMemo } from "react";

export type SessionDiffViewerProps = {
  patch: string;
  cacheKey: string;
  style: "unified" | "split";
};

export default function SessionDiffViewer({
  patch,
  cacheKey,
  style,
}: SessionDiffViewerProps) {
  const parsed = useMemo(() => {
    try {
      const fileDiff = parsePatchFiles(patch, cacheKey, true).flatMap(
        (item) => item.files,
      )[0];

      return fileDiff
        ? { fileDiff, error: null }
        : {
            fileDiff: null,
            error: "The patch did not contain a renderable file diff.",
          };
    } catch (error) {
      return {
        fileDiff: null,
        error:
          error instanceof Error
            ? error.message
            : "The patch could not be parsed.",
      };
    }
  }, [cacheKey, patch]);

  if (!parsed.fileDiff) {
    return (
      <div
        className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
        role="alert"
      >
        {parsed.error}
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-default/70 bg-surface">
      <FileDiff
        disableWorkerPool
        fileDiff={parsed.fileDiff}
        options={{
          diffStyle: style,
          disableFileHeader: true,
          hunkSeparators: "line-info-basic",
          overflow: "scroll",
          stickyHeader: false,
          theme: DEFAULT_THEMES,
          themeType: "light",
        }}
      />
    </div>
  );
}
