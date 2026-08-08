import { useEffect, useState } from "react";
import type { Highlighter } from "shiki";
import { Check, Copy } from "@/shared/ui/icons";

// One highlighter for the whole app: themes load once, languages lazily.
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter() {
  highlighterPromise ??= import("shiki").then(({ createHighlighter }) =>
    createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: [],
    }),
  );

  return highlighterPromise;
}

async function highlight(code: string, language: string) {
  const highlighter = await getHighlighter();

  if (!highlighter.getLoadedLanguages().includes(language)) {
    // Unknown languages reject here; callers fall back to plain text.
    await highlighter.loadLanguage(
      language as Parameters<Highlighter["loadLanguage"]>[0],
    );
  }

  return highlighter.codeToHtml(code, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: "light",
  });
}

export function ChatCodeBlock({
  code,
  language,
  className = "",
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!language || language === "plaintext" || language === "text") {
      setHighlightedHtml(null);
      return;
    }

    let cancelled = false;

    highlight(code, language)
      .then((html) => {
        if (!cancelled) {
          setHighlightedHtml(html);
        }
      })
      .catch(() => {
        // Unknown language or highlighter failure: keep the plain fallback.
        if (!cancelled) {
          setHighlightedHtml(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1500);

    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <div
      className={`chat-code-block ${className}`.trim()}
      data-slot="chat-code-block"
      data-testid="chat-code-block"
    >
      <button
        aria-label="Copy code"
        className="chat-code-block__copy"
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          setCopied(true);
        }}
      >
        {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      </button>
      {highlightedHtml ? (
        <div
          className="chat-code-block__highlighted"
          // Shiki output is generated locally from the code string, not user HTML.
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className="chat-code-block__plain">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
