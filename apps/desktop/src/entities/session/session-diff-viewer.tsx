import { DEFAULT_THEMES, parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useRef } from "react";

export type SessionDiffViewerProps = {
  patch: string;
  cacheKey: string;
  style: "unified" | "split";
  line?: number;
};

export default function SessionDiffViewer({
  patch,
  cacheKey,
  style,
  line,
}: SessionDiffViewerProps) {
  const focusFrame = useRef<number | null>(null);
  const focusedLine = useRef<string | null>(null);
  useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
  }, [cacheKey, line, style]);
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

  const selectedLines = useMemo(() => {
    const file = parsed.fileDiff;
    if (!file || !line || !Number.isSafeInteger(line) || line < 1) return null;
    const side = file.type === "deleted" ? "deletions" : "additions";
    // A bounded patch cannot reveal omitted context. Keep the file-level
    // jump instead of highlighting an unrelated row with a nearby index.
    const visible = file.hunks.some((hunk) => {
      const start = side === "deletions" ? hunk.deletionStart : hunk.additionStart;
      const count = side === "deletions" ? hunk.deletionCount : hunk.additionCount;
      return line >= start && line < start + count;
    });
    return visible ? { start: line, end: line, side } as const : null;
  }, [parsed.fileDiff, line]);

  if (!parsed.fileDiff) {
    return (
      <div
        className="bg-danger/5 px-3 py-2 text-sm text-danger"
        role="alert"
      >
        {parsed.error}
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden bg-surface">
      <FileDiff
        disableWorkerPool
        fileDiff={parsed.fileDiff}
        selectedLines={selectedLines}
        options={{
          diffStyle: style,
          disableFileHeader: true,
          hunkSeparators: "line-info-basic",
          overflow: "scroll",
          stickyHeader: false,
          theme: DEFAULT_THEMES,
          themeType: "light",
          onPostRender(node, instance, phase) {
            if (phase === "unmount" || !selectedLines) return;
            const key = `${cacheKey}:${line}:${style}`;
            if (focusedLine.current === key || focusFrame.current !== null) return;
            // Wait until the Dock and its file-level jump have laid out. Later
            // syntax-highlighting passes must not pull the user back here.
            focusFrame.current = requestAnimationFrame(() => {
              focusFrame.current = null;
              if (!node.isConnected) return;
              const indexes = instance.getLineIndex(selectedLines.start, selectedLines.side);
              const row = indexes && node.shadowRoot?.querySelector<HTMLElement>(
                `[data-column-number="${selectedLines.start}"][data-line-index="${indexes.join(",")}"]`,
              );
              if (row) {
                row.scrollIntoView({ block: "center" });
                focusedLine.current = key;
              }
            });
          },
        }}
      />
    </div>
  );
}
