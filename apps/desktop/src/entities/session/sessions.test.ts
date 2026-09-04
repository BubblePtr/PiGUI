import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatSessionListTime,
  listSessionProjections,
} from "@/entities/session/sessions";
import type { PiGUIRendererApi } from "@/shared/runtime";

describe("session queries", () => {
  afterEach(() => {
    delete window.pigui;
  });

  it("lists PiGUI Session Projections through the persisted projection endpoint", async () => {
    const invoke = vi.fn(async () => [
      {
        sessionId: "session-1",
        piSessionId: "pi-session-1",
        projectId: "pig",
        cwd: "/repo",
        status: "idle",
        updatedAt: "2026-07-03T10:00:00.000Z",
      },
    ]);
    window.pigui = {
      invoke: invoke as unknown as PiGUIRendererApi["invoke"],
      onBackendEvent: vi.fn(),
      onBrowserEvent: vi.fn(),
      onWindowFocusChanged: vi.fn(),
    };

    await expect(listSessionProjections()).resolves.toEqual([
      expect.objectContaining({
        sessionId: "session-1",
        piSessionId: "pi-session-1",
      }),
    ]);
    expect(invoke).toHaveBeenCalledWith("list_session_projections", undefined);
  });
});

describe("formatSessionListTime", () => {
  it("formats same-day timestamps with local Intl time, not ISO string slicing", () => {
    const now = new Date(2026, 6, 30, 18, 0, 0);
    const event = new Date(2026, 6, 30, 9, 5, 0);
    const formatted = formatSessionListTime(event.toISOString(), now);
    const expected = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(event);

    expect(formatted).toBe(expected);
    expect(formatted).toMatch(/^\d{2}:\d{2}$/);
  });

  it("formats other-day timestamps as compact day-count ago", () => {
    const now = new Date(2026, 6, 30, 18, 0, 0);
    const yesterday = new Date(2026, 6, 29, 9, 5, 0);
    const twoDaysAgo = new Date(2026, 6, 28, 9, 5, 0);

    expect(formatSessionListTime(yesterday.toISOString(), now)).toBe("1d ago");
    expect(formatSessionListTime(twoDaysAgo.toISOString(), now)).toBe("2d ago");
  });

  it("keeps counting calendar days across year boundaries", () => {
    const now = new Date(2026, 0, 2, 12, 0, 0);
    const earlier = new Date(2025, 11, 31, 9, 0, 0);

    expect(formatSessionListTime(earlier.toISOString(), now)).toBe("2d ago");
  });
});
