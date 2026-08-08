import { CodeBlock } from "@astryxdesign/core/CodeBlock";

/**
 * Thin wrapper over Astryx CodeBlock for non-markdown surfaces (session
 * logs, gallery). Highlighting, language label, and the copy button are
 * Astryx built-ins; unknown languages degrade to plain text.
 */
export function ChatCodeBlock({
  code,
  language = "plaintext",
  className = "",
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  return (
    <div
      className={`chat-code-block ${className}`.trim()}
      data-slot="chat-code-block"
      data-testid="chat-code-block"
    >
      <CodeBlock code={code} language={language} width="100%" />
    </div>
  );
}
