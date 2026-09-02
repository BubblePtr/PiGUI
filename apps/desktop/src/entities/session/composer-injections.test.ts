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

    expect(
      injectIntoComposer({ sessionId: "session-1", text: "Marked up", files: [file] }),
    ).toBe(true);

    expect(other).not.toHaveBeenCalled();
    expect(mine).toHaveBeenCalledWith({
      sessionId: "session-1",
      text: "Marked up",
      files: [file],
    });

    unsubscribeMine();
    unsubscribeOther();
  });

  it("reports a composer that was not there to take it", () => {
    const listener = vi.fn();

    subscribeComposerInjections("session-1", listener)();

    // Nothing is queued for a composer that is not mounted — an archived
    // Session has none at all — so the caller has to learn that its text went
    // nowhere and can say so instead of appearing to have sent it.
    expect(injectIntoComposer({ sessionId: "session-1", text: "Marked up" })).toBe(false);
    expect(injectIntoComposer({ sessionId: "session-2", text: "Marked up" })).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
