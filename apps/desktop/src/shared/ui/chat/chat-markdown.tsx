import { Markdown } from "@astryxdesign/core/Markdown";

/**
 * Chat prose renders through Astryx Markdown (compact density, per the
 * official ai-chat template). Fenced code uses the Astryx built-in code
 * block; ChatCodeBlock stays only for non-markdown surfaces.
 */
export function ChatMarkdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={`chat-markdown ${className}`.trim()}
      data-slot="chat-markdown"
      data-testid="markdown-renderer"
    >
      <Markdown density="compact">{children}</Markdown>
    </div>
  );
}

/**
 * Streaming variant: Astryx isStreaming does incremental parsing with a
 * fade-in on new chunks — that animation is the in-progress affordance, so
 * there is no separate caret.
 */
export function ChatStreamMarkdown({
  children,
  isStreaming = false,
  className = "",
}: {
  children: string;
  isStreaming?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`chat-markdown chat-markdown--stream ${className}`.trim()}
      data-is-streaming={String(Boolean(isStreaming))}
      data-slot="chat-stream-markdown"
      data-testid="stream-markdown-renderer"
    >
      <Markdown density="compact" isStreaming={isStreaming}>
        {children}
      </Markdown>
    </div>
  );
}
