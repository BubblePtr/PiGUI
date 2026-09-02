import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserViewState } from "@/shared/browser-protocol";
import {
  browserTitlebarBandPx,
  createBrowserHost,
  createBrowserSessionProvider,
  isBrowserCommand,
  normalizeBrowserUrl,
  resolveBrowserViewBounds,
  type BrowserHostView,
} from "./browser-host";

function createFakeView() {
  const calls: string[] = [];
  let url = "";

  const view: BrowserHostView & {
    calls: string[];
    bounds: { x: number; y: number; width: number; height: number } | null;
    visible: boolean;
    destroyed: boolean;
    loadRejection: Error | null;
    loadCount: () => number;
  } = {
    calls,
    bounds: null,
    visible: false,
    destroyed: false,
    loadRejection: null,
    loadCount: () => calls.filter((call) => call.startsWith("loadUrl")).length,
    setBounds(bounds) {
      view.bounds = bounds;
      calls.push(`setBounds(${bounds.x},${bounds.y},${bounds.width},${bounds.height})`);
    },
    setVisible(visible) {
      view.visible = visible;
      calls.push(`setVisible(${visible})`);
    },
    async loadUrl(next) {
      calls.push(`loadUrl(${next})`);
      // Chromium commits its error page under the requested URL, so a failed
      // load leaves getURL() reporting the target just like a good one.
      url = next;
      if (view.loadRejection) {
        throw view.loadRejection;
      }
    },
    goBack() {
      calls.push("goBack");
    },
    goForward() {
      calls.push("goForward");
    },
    reload() {
      calls.push("reload");
    },
    destroy() {
      view.destroyed = true;
      calls.push("destroy");
    },
    async capture() {
      calls.push("capture");
      return "data:image/png;base64,SNAPSHOT";
    },
    readState() {
      return { url, canGoBack: false, canGoForward: false };
    },
  };

  return view;
}

function createHostHarness(
  contentSize: { width: number; height: number } | null = { width: 1440, height: 900 },
) {
  const views: ReturnType<typeof createFakeView>[] = [];
  const externals: string[] = [];
  const host = createBrowserHost({
    createView() {
      const view = createFakeView();
      views.push(view);
      return view;
    },
    getContentSize: () => contentSize,
    openExternal(url) {
      externals.push(url);
    },
  });

  return { host, views, externals };
}

describe("normalizeBrowserUrl", () => {
  it("keeps http and https URLs and infers a scheme for bare input", () => {
    expect(normalizeBrowserUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeBrowserUrl("  http://example.com  ")).toBe("http://example.com/");
    // Public hosts must not fall back to cleartext…
    expect(normalizeBrowserUrl("example.com/docs")).toBe("https://example.com/docs");
    // …but a dev server typed as host:port is exactly what this surface is for.
    expect(normalizeBrowserUrl("localhost:5173")).toBe("http://localhost:5173/");
    expect(normalizeBrowserUrl("127.0.0.1:3000/app")).toBe("http://127.0.0.1:3000/app");
  });

  it("refuses everything that is not http or https", () => {
    expect(() => normalizeBrowserUrl("file:///etc/hosts")).toThrow(/http/i);
    expect(() => normalizeBrowserUrl("javascript:alert(1)")).toThrow(/http/i);
    expect(() => normalizeBrowserUrl("data:text/html,<b>x</b>")).toThrow(/http/i);
    expect(() => normalizeBrowserUrl("   ")).toThrow();
  });
});

describe("resolveBrowserViewBounds", () => {
  const contentSize = { width: 1440, height: 900 };

  it("passes a well-formed rect through, rounded", () => {
    expect(
      resolveBrowserViewBounds({
        rect: { x: 887.6, y: 80.2, width: 544.4, height: 780.1 },
        contentSize,
      }),
    ).toEqual({ x: 888, y: 80, width: 544, height: 780 });
  });

  it("clamps a renderer rect that would escape the window or cover the titlebar band", () => {
    expect(
      resolveBrowserViewBounds({
        rect: { x: -40, y: 0, width: 4000, height: 4000 },
        contentSize,
      }),
    ).toEqual({
      x: 0,
      y: browserTitlebarBandPx,
      width: 1440,
      height: 900 - browserTitlebarBandPx,
    });
  });

  it("never reports a negative size for a collapsed or off-screen rect", () => {
    expect(
      resolveBrowserViewBounds({
        rect: { x: 2000, y: 2000, width: -10, height: -10 },
        contentSize,
      }),
    ).toEqual({ x: 1440, y: 900, width: 0, height: 0 });
  });
});

describe("browser host commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the view on the first navigate and reports the loaded state", async () => {
    const { host, views } = createHostHarness();

    const state = await host.invoke("browser_navigate", { url: "localhost:5173" });

    expect(views).toHaveLength(1);
    expect(views[0].calls).toContain("loadUrl(http://localhost:5173/)");
    expect(state).toMatchObject({ url: "http://localhost:5173/" });
  });

  it("does not reload when asked to navigate to the URL already showing", async () => {
    const { host, views } = createHostHarness();

    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });
    await host.invoke("browser_navigate", { url: "localhost:5173" });

    expect(views).toHaveLength(1);
    expect(views[0].loadCount()).toBe(1);
  });

  it("retries a URL the view is only showing because its load failed", async () => {
    const { host, views } = createHostHarness();

    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });
    // The error page sits under the requested URL, so "already showing" and
    // "already failed" look identical from getURL() alone — Retry and
    // re-entering the surface would both become no-ops.
    host.recordLoadFailure();
    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });

    expect(views[0].loadCount()).toBe(2);
  });

  it("remembers a rejected load as a failure without being told", async () => {
    const { host, views } = createHostHarness();

    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });
    views[0].loadRejection = new Error("ERR_CONNECTION_REFUSED");

    await expect(
      host.invoke("browser_navigate", { url: "http://localhost:4000/" }),
    ).rejects.toThrow("ERR_CONNECTION_REFUSED");

    views[0].loadRejection = null;
    await host.invoke("browser_navigate", { url: "http://localhost:4000/" });

    expect(views[0].loadCount()).toBe(3);
  });

  it("short-circuits again once a load has succeeded", async () => {
    const { host, views } = createHostHarness();

    host.recordLoadFailure();
    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });
    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });

    expect(views[0].loadCount()).toBe(1);
  });

  it("stamps a fresh navigation id on every navigate", async () => {
    const { host } = createHostHarness();
    // The command group is heterogeneous (capture answers with a data URL), so
    // the navigate results need narrowing before the ids can be compared.
    const navigate = async (url: string) =>
      (await host.invoke("browser_navigate", { url })) as BrowserViewState;

    const first = await navigate("http://a.test/");
    const second = await navigate("http://b.test/");

    expect(second.navigationId).toBe(first.navigationId + 1);
    // Events main forwards carry whatever id is current, so a page still
    // talking after a Project switch is distinguishable from the new one.
    expect(host.currentNavigationId()).toBe(second.navigationId);
  });

  it("refuses to navigate to a non-http scheme and never creates a view for it", async () => {
    const { host, views } = createHostHarness();

    await expect(
      host.invoke("browser_navigate", { url: "file:///etc/hosts" }),
    ).rejects.toThrow(/http/i);
    expect(views).toHaveLength(0);
  });

  it("keeps the view hidden until it has usable bounds", async () => {
    const { host, views } = createHostHarness();

    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });
    // Visibility asked for before any bounds arrived: showing now would paint
    // the native view at 0,0 over the whole window.
    await host.invoke("browser_set_visible", { visible: true });
    expect(views[0].visible).toBe(false);

    await host.invoke("browser_set_bounds", {
      rect: { x: 900, y: 80, width: 500, height: 700 },
    });
    expect(views[0].visible).toBe(true);

    // A collapsed rect (panel closed mid-drag) hides it again.
    await host.invoke("browser_set_bounds", {
      rect: { x: 900, y: 80, width: 0, height: 0 },
    });
    expect(views[0].visible).toBe(false);
  });

  it("clamps renderer bounds against the live window content size", async () => {
    const { host, views } = createHostHarness({ width: 1000, height: 700 });

    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });
    await host.invoke("browser_set_bounds", {
      rect: { x: 800, y: 0, width: 900, height: 900 },
    });

    expect(views[0].bounds).toEqual({ x: 800, y: 40, width: 200, height: 660 });
  });

  it("applies bounds and visibility that arrived before the view existed", async () => {
    const { host, views } = createHostHarness();

    // The surface renders its placeholder optimistically, so bounds and
    // visibility can reach main ahead of the navigate that creates the view.
    // Dropping them there would leave the view unbounded and never visible.
    await host.invoke("browser_set_bounds", {
      rect: { x: 900, y: 80, width: 500, height: 700 },
    });
    await host.invoke("browser_set_visible", { visible: true });

    expect(views).toHaveLength(0);

    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });

    expect(views[0].bounds).toEqual({ x: 900, y: 80, width: 500, height: 700 });
    expect(views[0].visible).toBe(true);
  });

  it("ignores navigation controls while no view exists", async () => {
    const { host, views } = createHostHarness();

    await expect(host.invoke("browser_back")).resolves.toBeNull();
    await expect(host.invoke("browser_reload")).resolves.toBeNull();
    await expect(
      host.invoke("browser_set_bounds", { rect: { x: 0, y: 40, width: 10, height: 10 } }),
    ).resolves.toBeNull();
    expect(views).toHaveLength(0);
  });

  it("opens external URLs through the shell without creating a view", async () => {
    const { host, views, externals } = createHostHarness();

    await host.invoke("browser_open_external", { url: "example.com" });

    expect(externals).toEqual(["https://example.com/"]);
    expect(views).toHaveLength(0);
    await expect(
      host.invoke("browser_open_external", { url: "javascript:alert(1)" }),
    ).rejects.toThrow(/http/i);
  });

  it("rejects unknown commands in the group instead of silently succeeding", async () => {
    const { host } = createHostHarness();

    await expect(host.invoke("browser_teleport")).rejects.toThrow(/browser_teleport/);
  });

  it("captures the page as a data URL, and answers null with no view to capture", async () => {
    const { host, views } = createHostHarness();

    // The surface asks for a still whenever a DOM overlay opens; before the
    // first navigate there is nothing to photograph, and inventing a blank
    // one would flash over the page.
    await expect(host.invoke("browser_capture")).resolves.toBeNull();
    expect(views).toHaveLength(0);

    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });

    await expect(host.invoke("browser_capture")).resolves.toBe(
      "data:image/png;base64,SNAPSHOT",
    );
  });

  it("claims only the commands it implements, so the backend keeps the rest", () => {
    for (const command of [
      "browser_capture",
      "browser_navigate",
      "browser_back",
      "browser_forward",
      "browser_reload",
      "browser_set_bounds",
      "browser_set_visible",
      "browser_open_external",
    ]) {
      expect(isBrowserCommand(command)).toBe(true);
    }

    // Sniffing the `browser_` prefix would hijack any future backend command
    // that happens to start with it.
    expect(isBrowserCommand("browser_screenshot")).toBe(false);
    expect(isBrowserCommand("list_terminals")).toBe(false);
  });
});

describe("browser host security handlers", () => {
  it("allows only http and https for page-initiated navigation", () => {
    const { host } = createHostHarness();

    expect(host.allowsNavigationTo("https://example.com")).toBe(true);
    expect(host.allowsNavigationTo("http://localhost:5173/")).toBe(true);
    expect(host.allowsNavigationTo("file:///etc/hosts")).toBe(false);
    expect(host.allowsNavigationTo("javascript:alert(1)")).toBe(false);
    expect(host.allowsNavigationTo("data:text/html,<b>x</b>")).toBe(false);
    expect(host.allowsNavigationTo("not a url")).toBe(false);
  });

  it("turns a refused window.open into an in-place navigation, but only for http(s)", async () => {
    const { host, views } = createHostHarness();

    await host.invoke("browser_navigate", { url: "http://localhost:5173/" });

    host.handleWindowOpen("https://example.com/next");
    expect(views[0].calls).toContain("loadUrl(https://example.com/next)");

    host.handleWindowOpen("javascript:alert(1)");
    expect(views[0].calls).not.toContain("loadUrl(javascript:alert(1))");
    // A blocked popup must never spawn a second native view either.
    expect(views).toHaveLength(1);
  });

  it("denies every page permission request", () => {
    const { host } = createHostHarness();

    for (const permission of [
      "media",
      "geolocation",
      "notifications",
      "midi",
      "clipboard-read",
      "display-capture",
      "fullscreen",
      "openExternal",
    ]) {
      expect(host.allowsPermission(permission)).toBe(false);
    }
  });
});

function createFakeSession() {
  const registrations = {
    permissionRequest: 0,
    permissionCheck: 0,
    downloadBlockers: 0,
  };
  let permissionHandler: ((permission: string) => boolean) | null = null;

  return {
    registrations,
    decidePermission: (permission: string) => permissionHandler?.(permission),
    setPermissionRequestHandler(handler: (permission: string) => boolean) {
      registrations.permissionRequest += 1;
      permissionHandler = handler;
    },
    setPermissionCheckHandler() {
      registrations.permissionCheck += 1;
    },
    blockDownloads() {
      registrations.downloadBlockers += 1;
    },
  };
}

describe("browser session provider", () => {
  it("configures the shared persistent session once, however often the view is recreated", () => {
    const persistent = createFakeSession();
    let built = 0;
    const provide = createBrowserSessionProvider(
      () => {
        built += 1;
        return persistent;
      },
      () => false,
    );

    // Disposing and re-creating the view asks for the session again, and
    // `session.fromPartition` hands back the same object every time. Permission
    // handlers replace, but a download blocker is a listener: registering it
    // per view would stack one copy per recreation.
    expect(provide()).toBe(persistent);
    expect(provide()).toBe(persistent);
    expect(provide()).toBe(persistent);

    expect(built).toBe(1);
    expect(persistent.registrations).toEqual({
      permissionRequest: 1,
      permissionCheck: 1,
      downloadBlockers: 1,
    });
    expect(persistent.decidePermission("geolocation")).toBe(false);
  });
});
