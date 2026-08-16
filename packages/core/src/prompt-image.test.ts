import { describe, expect, it } from "vitest";
import {
  parseRuntimePromptImages,
  promptImageDataUrl,
  toPiImageContent,
} from "./prompt-image";

describe("parseRuntimePromptImages", () => {
  it("keeps well-formed image attachments and drops the rest", () => {
    expect(
      parseRuntimePromptImages([
        { mimeType: "image/png", data: "abc", name: "shot.png" },
        { mimeType: "image/jpeg" },
        { data: "xyz" },
        "nope",
        { mimeType: "image/webp", data: "def" },
      ]),
    ).toEqual([
      { mimeType: "image/png", data: "abc", name: "shot.png" },
      { mimeType: "image/webp", data: "def" },
    ]);
  });

  it("returns an empty list for missing or non-array values", () => {
    expect(parseRuntimePromptImages(undefined)).toEqual([]);
    expect(parseRuntimePromptImages(null)).toEqual([]);
    expect(parseRuntimePromptImages({ mimeType: "image/png", data: "abc" })).toEqual([]);
  });
});

describe("prompt image encoding", () => {
  it("builds a data URL and strips the display name for Pi", () => {
    const image = { mimeType: "image/png", data: "abc", name: "shot.png" };

    expect(promptImageDataUrl(image)).toBe("data:image/png;base64,abc");
    expect(toPiImageContent(image)).toEqual({
      type: "image",
      mimeType: "image/png",
      data: "abc",
    });
  });
});
