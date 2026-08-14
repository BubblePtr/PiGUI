export type AttachmentKind = "image" | "text";

export type ComposerAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  sizeLabel: string;
  file: File;
  src?: string;
};

export const ATTACHMENT_REJECT_COPY =
  "PiGUI can only attach images and text files.";
export const IMAGE_SEND_COPY =
  "Image attachments can't be sent yet. Remove them to send this prompt.";
export const TEXT_TOO_LARGE_COPY =
  "A text attachment is too large to inline into the prompt.";
export const TEXT_ATTACHMENT_LIMIT_BYTES = 256 * 1024;
export const FILE_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.txt,.md,.ts,.tsx,.js,.jsx,.mjs,.cjs,.json,.css,.html,.yml,.yaml,.toml,.rs,.go,.py,.rb,.sh";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const TEXT_EXT =
  /\.(txt|md|tsx?|jsx?|mjs|cjs|json|css|html?|ya?ml|toml|rs|go|py|rb|sh)$/i;

export function classifyFile(file: File): AttachmentKind | "reject" {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("text/") || file.type === "application/json") {
    return "text";
  }

  if (IMAGE_EXT.test(file.name)) {
    return "image";
  }

  if (TEXT_EXT.test(file.name)) {
    return "text";
  }

  return "reject";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function insertIntoDraft(current: string, text: string) {
  if (!current) {
    return text;
  }

  const pad = current.endsWith(" ") ? "" : " ";
  return `${current}${pad}${text}`;
}

export async function buildPromptWithAttachments(
  draft: string,
  items: ComposerAttachment[],
): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  if (items.some((item) => item.kind === "image")) {
    return { ok: false, error: IMAGE_SEND_COPY };
  }

  const chunks: string[] = [];
  const trimmed = draft.trim();

  if (trimmed) {
    chunks.push(trimmed);
  }

  for (const item of items) {
    if (item.file.size > TEXT_ATTACHMENT_LIMIT_BYTES) {
      return { ok: false, error: TEXT_TOO_LARGE_COPY };
    }

    const body = await item.file.text();
    chunks.push(`[Attached file: ${item.name}]\n\n\`\`\`\n${body}\n\`\`\``);
  }

  const prompt = chunks.join("\n\n");

  if (!prompt) {
    return { ok: false, error: "Type a message or attach a text file." };
  }

  return { ok: true, prompt };
}
