import { Code } from "@astryxdesign/core/Code";
import { Markdown } from "@astryxdesign/core/Markdown";

/**
 * Chat sits under the page h1 (Sessions / Trace / …). Markdown `#` must
 * not mint another top-level heading in the document outline.
 */
const chatHeadingLevelStart = 3;

/**
 * Astryx's default inline code sits at body size with zero vertical padding,
 * so its 18px chip fills a 20px line box and adjacent code-bearing lines
 * touch. Chat routes inline code through this override so chat.css can size
 * the chip against the chat prose leading; other Code usages stay default.
 */
function ChatInlineCode({ children }: { children: string }) {
  return (
    <Code className="chat-inline-code" data-slot="chat-inline-code">
      {children}
    </Code>
  );
}

const chatMarkdownComponents = { inlineCode: ChatInlineCode };

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
      <Markdown
        components={chatMarkdownComponents}
        density="compact"
        headingLevelStart={chatHeadingLevelStart}
      >
        {children}
      </Markdown>
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
      <Markdown
        components={chatMarkdownComponents}
        density="compact"
        headingLevelStart={chatHeadingLevelStart}
        isStreaming={isStreaming}
      >
        {children}
      </Markdown>
    </div>
  );
}
