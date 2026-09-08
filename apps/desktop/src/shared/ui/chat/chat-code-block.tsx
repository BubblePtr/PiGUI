import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import type { ComponentProps } from "react";

/**
 * Thin wrapper over Astryx CodeBlock for non-markdown surfaces (session
 * logs, gallery). Highlighting, language label, and the copy button are
 * Astryx built-ins; unknown languages degrade to plain text.
 */
type ChatCodeBlockOwnProps = {
  code: string;
  language?: string;
};

export type ChatCodeBlockProps = Omit<ComponentProps<"div">, keyof ChatCodeBlockOwnProps | "children"> &
  ChatCodeBlockOwnProps;

export function ChatCodeBlock({
  code,
  language = "plaintext",
  className = "",
  ...rest
}: ChatCodeBlockProps) {
  return (
    <div
      className={`chat-code-block ${className}`.trim()}
      data-slot="chat-code-block"
      data-testid="chat-code-block"
      {...rest}
    >
      <CodeBlock code={code} language={language} width="100%" />
    </div>
  );
}
