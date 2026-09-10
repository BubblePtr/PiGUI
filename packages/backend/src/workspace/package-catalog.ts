import type { PackageCatalogPage, ResourceInfo } from "@pace/core";

const registry = "https://registry.npmjs.org";
const pageSize = 24;
const resourceKeys = {
  extensions: "extension",
  skills: "skill",
  prompts: "prompt",
  themes: "theme",
} as const;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readJson(
  url: URL | string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`npm catalogue request failed (${response.status})`);
  return response.json();
}

export async function searchPackageCatalog(input: {
  query?: string;
  offset?: number;
}): Promise<PackageCatalogPage> {
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
    throw new Error("Invalid catalogue offset");
  const query = input.query?.trim() ?? "";
  if (query.length > 200) throw new Error("Catalogue query is too long");
  const url = new URL(`${registry}/-/v1/search`);
  url.search = new URLSearchParams({
    text: `keywords:pi-package ${query}`.trim(),
    size: String(pageSize),
    from: String(offset),
  }).toString();
  // One deadline covers search and all manifests, including queued requests.
  const signal = AbortSignal.timeout(12000);
  const result = record(await readJson(url, signal));
  if (!Array.isArray(result.objects) || typeof result.total !== "number")
    throw new Error("Invalid npm search response");
  const packages: PackageCatalogPage["packages"] = result.objects.map(
    (item) => {
      const pkg = record(record(item).package);
      if (
        typeof pkg.name !== "string" ||
        !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(pkg.name) ||
        typeof pkg.version !== "string"
      )
        throw new Error("Invalid npm search response");
      const publisher = record(pkg.publisher);
      return {
        source: `npm:${pkg.name}`,
        name: pkg.name,
        version: pkg.version,
        description:
          typeof pkg.description === "string" ? pkg.description : undefined,
        author:
          typeof publisher.username === "string"
            ? publisher.username
            : undefined,
        kinds: [],
        typesKnown: false,
      };
    },
  );
  let cursor = 0;
  // Keep catalogue browsing from opening one connection per search result.
  await Promise.all(
    Array.from({ length: Math.min(4, packages.length) }, async () => {
      while (cursor < packages.length) {
        const pkg = packages[cursor++];
        try {
          const manifest = record(
            await readJson(
              `${registry}/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`,
              signal,
            ),
          );
          const pi = record(manifest.pi);
          pkg.kinds = Object.entries(resourceKeys)
            .filter(([key]) => Array.isArray(pi[key]) && pi[key].length > 0)
            .map(([, kind]): ResourceInfo["kind"] => kind);
          // Convention-directory packages may omit pi; absence is not an empty resource list.
          pkg.typesKnown = manifest.pi !== undefined;
        } catch {
          pkg.typesKnown = false;
        }
      }
    }),
  );
  const nextOffset = offset + packages.length;
  return {
    packages,
    total: result.total,
    nextOffset:
      packages.length && nextOffset < result.total && nextOffset <= 10000
        ? nextOffset
        : null,
  };
}
