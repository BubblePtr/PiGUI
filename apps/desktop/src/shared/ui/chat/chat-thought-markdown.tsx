import type { ReactNode } from "react";

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function dropUnclosedMarkers(text: string) {
  if (/^\*{1,2}$/.test(text)) {
    return "";
  }
  const parts = text.split("**");
  if (parts.length % 2 === 0) {
    return parts.slice(0, -1).join("**") + parts[parts.length - 1];
  }
  return text;
}

function unwrapWholeLineEmphasis(text: string) {
  return text.replace(/(^|\n)\*\*([^*\n]+)\*\*(?=\n|$)/g, "$1$2");
}

const SENTENCE_BOUNDARY = /(?<=[.!?。！？])\s+/;

/** One live viewport beat: last line, or last sentence of a single paragraph. */
export function thoughtBeats(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return lines;
  }
  const only = lines[0] ?? "";
  return only
    .split(SENTENCE_BOUNDARY)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function liveThoughtLine(text: string) {
  const beats = thoughtBeats(text);
  return beats[beats.length - 1] ?? "";
}

export function liveThoughtBeatIndex(text: string) {
  return Math.max(0, thoughtBeats(text).length - 1);
}

function renderInline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

/** Lightweight inline markdown for thinking. Streaming-safe: unclosed ** is hidden. */
export function ChatThoughtMarkdown({
  text,
  unwrapLines = false,
}: {
  text: string;
  unwrapLines?: boolean;
}) {
  let source = dropUnclosedMarkers(text);
  if (unwrapLines) {
    source = unwrapWholeLineEmphasis(source);
  }

  return <span className="chat-thought-md">{renderInline(source)}</span>;
}
