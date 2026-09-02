import { describe, expect, it, vi } from "vitest";
import {
  injectIntoComposer,
  subscribeComposerInjections,
} from "./composer-injections";

describe("composer injections", () => {
  it("reaches the composer of the named session and no other", () => {
    const mine = vi.fn();
    const other = vi.fn();
    const unsubscribeMine = subscribeComposerInjections("session-1", mine);
    const unsubscribeOther = subscribeComposerInjections("session-2", other);
    const file = new File(["png"], "browser-annotations.png", { type: "image/png" });

    injectIntoComposer({ sessionId: "session-1", text: "Marked up", files: [file] });

    expect(other).not.toHaveBeenCalled();
    expect(mine).toHaveBeenCalledWith({
      sessionId: "session-1",
      text: "Marked up",
      files: [file],
    });

    unsubscribeMine();
    unsubscribeOther();
  });

  it("stops delivering once the composer is gone", () => {
    const listener = vi.fn();

    subscribeComposerInjections("session-1", listener)();
    // Nothing is queued for a composer that is not mounted: the marks stay in
    // the page and the user can send them again from the surface.
    injectIntoComposer({ sessionId: "session-1", text: "Marked up" });

    expect(listener).not.toHaveBeenCalled();
  });
});
