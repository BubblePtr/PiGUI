import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatPixelLoader } from "@/shared/ui/chat/chat-pixel-loader";

describe("ChatPixelLoader", () => {
  // The heartbeat period is a decision, not an incidental number: ADR-0030 §8
  // rejected the 650ms the old private loader used as too hurried on the
  // status line. Nothing else in the suite would notice a regression.
  it("beats at the 860ms period ADR-0030 settled on", () => {
    const { container } = render(<ChatPixelLoader />);

    const loader = container.querySelector<HTMLElement>('[data-slot="chat-pixel-loader"]');

    expect(loader?.style.getPropertyValue("--chat-pixel-period")).toBe("860ms");
  });

  it("takes an explicit period", () => {
    const { container } = render(<ChatPixelLoader periodMs={650} />);

    const loader = container.querySelector<HTMLElement>('[data-slot="chat-pixel-loader"]');

    expect(loader?.style.getPropertyValue("--chat-pixel-period")).toBe("650ms");
  });
});
