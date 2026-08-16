// Prompt image attachments — the product-layer shape forwarded on
// send_prompt / queue_follow_up / steer_run. `data` is raw base64, matching
// Pi's ImageContent so drivers can pass it through without re-encoding.

export type RuntimePromptImage = {
  mimeType: string;
  data: string;
  name?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRuntimePromptImages(value: unknown): RuntimePromptImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const images: RuntimePromptImage[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const mimeType = typeof entry.mimeType === "string" ? entry.mimeType : "";
    const data = typeof entry.data === "string" ? entry.data : "";

    if (!mimeType || !data) {
      continue;
    }

    const image: RuntimePromptImage = { mimeType, data };

    if (typeof entry.name === "string" && entry.name) {
      image.name = entry.name;
    }

    images.push(image);
  }

  return images;
}

export function promptImageDataUrl(
  image: Pick<RuntimePromptImage, "mimeType" | "data">,
): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

export function toPiImageContent(image: RuntimePromptImage): {
  type: "image";
  mimeType: string;
  data: string;
} {
  return {
    type: "image",
    mimeType: image.mimeType,
    data: image.data,
  };
}

export function clonePromptImages(
  images: readonly RuntimePromptImage[] | undefined,
): RuntimePromptImage[] | undefined {
  if (!images?.length) {
    return undefined;
  }

  return images.map((image) => ({
    mimeType: image.mimeType,
    data: image.data,
    ...(image.name ? { name: image.name } : {}),
  }));
}
