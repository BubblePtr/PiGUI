import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatCodeBlock } from "@/shared/ui/chat/chat-code-block";

const remarkPlugins = [remarkGfm];

/**
 * Fenced code blocks get shiki highlighting through ChatCodeBlock; inline code
 * stays a plain <code> so it inherits the surrounding text styles.
 */
function MarkdownCode({ className, children }: ComponentProps<"code">) {
  const language = /language-(\w+)/.exec(className ?? "")?.[1];

  if (!language) {
    return <code className={className}>{children}</code>;
  }

  return (
    <ChatCodeBlock
      code={typeof children === "string" ? children.replace(/\n$/, "") : String(children ?? "")}
      language={language}
    />
  );
}

// Keep <pre> unstyled: ChatCodeBlock renders its own surface.
function MarkdownPre({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

const markdownComponents = {
  code: MarkdownCode,
  pre: MarkdownPre,
};

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
      <ReactMarkdown components={markdownComponents} remarkPlugins={remarkPlugins}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function ChatStreamMarkdown({
  children,
  isStreaming = false,
  caret = "block",
  className = "",
}: {
  children: string;
  isStreaming?: boolean;
  caret?: "block";
  className?: string;
}) {
  return (
    <div
      className={`chat-markdown chat-markdown--stream ${className}`.trim()}
      data-is-streaming={String(Boolean(isStreaming))}
      data-slot="chat-stream-markdown"
      data-testid="stream-markdown-renderer"
    >
      <ReactMarkdown components={markdownComponents} remarkPlugins={remarkPlugins}>
        {children}
      </ReactMarkdown>
      {isStreaming ? (
        <span
          aria-hidden="true"
          className={`chat-markdown__caret chat-markdown__caret--${caret}`}
        />
      ) : null}
    </div>
  );
}
