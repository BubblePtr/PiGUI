import type { ChatToolItem } from "@/shared/ui/chat/chat-tool";
import { FileIcon, Globe, Pencil, Search, SquareTerminal, Wrench } from "@/shared/ui/icons";

/**
 * Visual class of a tool call, for the Codex-style kind icon on a CoT row.
 * The name is the model's; we only map the well-known Pi builtins and fall
 * back to a generic wrench rather than inventing a glyph per plugin.
 */
export type ToolKind = "shell" | "search" | "web" | "file" | "edit" | "tool";

const KIND_ALIASES: Record<string, ToolKind> = {
  bash: "shell",
  shell: "shell",
  sh: "shell",
  terminal: "shell",
  cmd: "shell",
  grep: "search",
  find: "search",
  glob: "search",
  ls: "search",
  search: "search",
  web_search: "web",
  websearch: "web",
  webfetch: "web",
  web_fetch: "web",
  web: "web",
  browser: "web",
  read: "file",
  read_file: "file",
  cat: "file",
  edit: "edit",
  write: "edit",
  write_file: "edit",
  str_replace: "edit",
};

export function normalizeToolName(name: string | undefined) {
  return (name ?? "").trim().toLowerCase().replace(/-/g, "_");
}

export function toolKindFromName(name: string | undefined): ToolKind {
  return KIND_ALIASES[normalizeToolName(name)] ?? "tool";
}

/** A burst of mixed kinds shares the generic wrench, matching Codex's header. */
export function toolKindFromTools(tools: ChatToolItem[]): ToolKind {
  const kinds = new Set(tools.map((tool) => toolKindFromName(tool.toolName)));

  if (kinds.size === 1) {
    return [...kinds][0];
  }

  return "tool";
}

const KIND_ICONS = {
  shell: SquareTerminal,
  search: Search,
  web: Globe,
  file: FileIcon,
  edit: Pencil,
  tool: Wrench,
} as const;

export function ChatToolKindIcon({
  className = "",
  kind,
}: {
  className?: string;
  kind: ToolKind;
}) {
  const Icon = KIND_ICONS[kind];

  return (
    <span
      aria-hidden="true"
      className={`chat-tool-kind ${className}`.trim()}
      data-kind={kind}
      data-slot="chat-tool-kind"
    >
      <Icon />
    </span>
  );
}
