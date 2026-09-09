import { afterEach, expect, it, vi } from "vitest";
import { searchPackageCatalog } from "./package-catalog";

afterEach(() => vi.unstubAllGlobals());

it("paginates npm Pi packages and reads declarations without turning directories into resources", async () => {
  const fetcher = vi.fn(async (url: string | URL) => {
    if (String(url).includes("/-/v1/search"))
      return Response.json({
        total: 50,
        objects: [
          {
            package: {
              name: "@community/review",
              version: "2.3.0",
              description: "Review changes",
              publisher: { username: "maintainer" },
            },
          },
        ],
      });
    return Response.json({
      pi: { extensions: ["extensions"], skills: ["skills"], themes: [] },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await searchPackageCatalog({ query: "review", offset: 24 });
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("text")).toBe("keywords:pi-package review");
  expect(url.searchParams.get("from")).toBe("24");
  expect(result).toMatchObject({
    total: 50,
    nextOffset: 25,
    packages: [
      {
        source: "npm:@community/review",
        name: "@community/review",
        version: "2.3.0",
        author: "maintainer",
        kinds: ["extension", "skill"],
        typesKnown: true,
      },
    ],
  });
  expect(String(fetcher.mock.calls[1][0])).toBe(
    "https://registry.npmjs.org/%40community%2Freview/2.3.0",
  );
  expect(fetcher.mock.calls).toHaveLength(2);
});

it("keeps results with unknown types when an individual manifest cannot be read", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) =>
      String(url).includes("/-/v1/search")
        ? Response.json({
            total: 1,
            objects: [{ package: { name: "pi-review", version: "1.0.0" } }],
          })
        : new Response("unavailable", { status: 503 }),
    ),
  );
  await expect(searchPackageCatalog({})).resolves.toMatchObject({
    nextOffset: null,
    packages: [{ name: "pi-review", kinds: [], typesKnown: false }],
  });
});

it("surfaces registry failures and rejects invalid pagination before fetching", async () => {
  const fetcher = vi.fn(async () => new Response("busy", { status: 429 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(searchPackageCatalog({ offset: -1 })).rejects.toThrow("offset");
  expect(fetcher).not.toHaveBeenCalled();
  await expect(searchPackageCatalog({})).rejects.toThrow("429");
  fetcher.mockResolvedValueOnce(Response.json({ objects: "broken" }));
  await expect(searchPackageCatalog({})).rejects.toThrow(
    "Invalid npm search response",
  );
});
