import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

class TestResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const boxSize = [{ inlineSize: 1024, blockSize: 720 }];

    this.callback(
      [
        {
          target,
          borderBoxSize: boxSize,
          contentRect: {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 1024,
            bottom: 720,
            width: 1024,
            height: 720,
            toJSON: () => ({}),
          },
          contentBoxSize: boxSize,
          devicePixelContentBoxSize: boxSize,
        } as ResizeObserverEntry,
      ],
      this,
    );
  }

  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  configurable: true,
  value: TestResizeObserver,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  writable: true,
  configurable: true,
  value: () => {},
});

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  writable: true,
  configurable: true,
  value: () => [],
});
