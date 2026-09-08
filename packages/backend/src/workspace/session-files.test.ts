import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeSessionFilesReader } from "./session-files";

const tempDirs: string[] = [];

async function tempDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "pigui-session-files-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function checkout() {
  const root = await tempDirectory();
  await mkdir(join(root, "src", "nested"), { recursive: true });
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, "README.md"), "# hello\n", "utf8");
  await writeFile(join(root, "src", "app.ts"), "export const a = 1;\n", "utf8");
  await writeFile(join(root, "src", "nested", "deep.txt"), "deep\n", "utf8");
  await writeFile(join(root, "Zebra.txt"), "z\n", "utf8");
  await writeFile(join(root, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]));
  return root;
}

describe("createNodeSessionFilesReader", () => {
  describe("listDirectory", () => {
    it("lists the root with directories first, names case-insensitively sorted, and .git hidden", async () => {
      const root = await checkout();
      const reader = createNodeSessionFilesReader();

      const listing = await reader.listDirectory({ sessionId: "s1", diffRoot: root, path: "" });

      expect(listing).toMatchObject({ sessionId: "s1", path: "", truncated: false });
      expect(listing.rootName).toBe(root.split("/").at(-1));
      expect(listing.entries.map((entry) => `${entry.kind}:${entry.path}`)).toEqual([
        "directory:src",
        "file:image.png",
        "file:README.md",
        "file:Zebra.txt",
      ]);
      expect(listing.entries.find((entry) => entry.name === "README.md")?.size).toBe(8);
    });

    it("lists a nested directory by diff-root-relative path", async () => {
      const root = await checkout();
      const reader = createNodeSessionFilesReader();

      const listing = await reader.listDirectory({ sessionId: "s1", diffRoot: root, path: "src" });

      expect(listing.entries.map((entry) => entry.path)).toEqual(["src/nested", "src/app.ts"]);
    });

    it("rejects paths that leave the diff root", async () => {
      const root = await checkout();
      const reader = createNodeSessionFilesReader();

      for (const path of ["..", "../", "src/../..", "/etc", "src\0"]) {
        await expect(
          reader.listDirectory({ sessionId: "s1", diffRoot: root, path }),
        ).rejects.toThrow(/outside|invalid/i);
      }
    });

    it("refuses to follow a symlink that escapes the diff root", async () => {
      const root = await checkout();
      const outside = await tempDirectory();
      await writeFile(join(outside, "secret.txt"), "secret\n", "utf8");
      await symlink(outside, join(root, "escape"));
      const reader = createNodeSessionFilesReader();

      const listing = await reader.listDirectory({ sessionId: "s1", diffRoot: root, path: "" });
      expect(listing.entries.find((entry) => entry.name === "escape")?.kind).toBe("symlink");

      await expect(
        reader.listDirectory({ sessionId: "s1", diffRoot: root, path: "escape" }),
      ).rejects.toThrow(/outside/i);
      await expect(
        reader.readFile({ sessionId: "s1", diffRoot: root, path: "escape/secret.txt" }),
      ).rejects.toThrow(/outside/i);
    });

    it("bounds oversized directories and reports the cut", async () => {
      const root = await tempDirectory();
      await Promise.all(
        Array.from({ length: 30 }, (_, index) =>
          writeFile(join(root, `file-${String(index).padStart(2, "0")}.txt`), "x", "utf8"),
        ),
      );
      const reader = createNodeSessionFilesReader({ maxEntries: 10 });

      const listing = await reader.listDirectory({ sessionId: "s1", diffRoot: root, path: "" });

      expect(listing.entries).toHaveLength(10);
      expect(listing.truncated).toBe(true);
    });
  });

  describe("readFile", () => {
    it("returns UTF-8 text with its size", async () => {
      const root = await checkout();
      const reader = createNodeSessionFilesReader();

      await expect(
        reader.readFile({ sessionId: "s1", diffRoot: root, path: "src/app.ts" }),
      ).resolves.toEqual({
        sessionId: "s1",
        path: "src/app.ts",
        size: 20,
        content: "export const a = 1;\n",
        truncated: false,
        binary: false,
      });
    });

    it("flags binary files instead of returning their bytes", async () => {
      const root = await checkout();
      const reader = createNodeSessionFilesReader();

      await expect(
        reader.readFile({ sessionId: "s1", diffRoot: root, path: "image.png" }),
      ).resolves.toMatchObject({ binary: true, content: "", size: 6 });
    });

    it("truncates files past the byte limit on a line boundary", async () => {
      const root = await tempDirectory();
      await writeFile(join(root, "big.txt"), "0123456789\nabcdefghij\nklmnopqrst\n", "utf8");
      const reader = createNodeSessionFilesReader({ maxFileBytes: 25 });

      await expect(
        reader.readFile({ sessionId: "s1", diffRoot: root, path: "big.txt" }),
      ).resolves.toMatchObject({
        content: "0123456789\nabcdefghij\n",
        truncated: true,
        size: 33,
      });
    });

    it("rejects directories and paths outside the diff root", async () => {
      const root = await checkout();
      const reader = createNodeSessionFilesReader();

      await expect(
        reader.readFile({ sessionId: "s1", diffRoot: root, path: "src" }),
      ).rejects.toThrow(/not a file/i);
      await expect(
        reader.readFile({ sessionId: "s1", diffRoot: root, path: "../x" }),
      ).rejects.toThrow(/outside|invalid/i);
    });
  });
});
