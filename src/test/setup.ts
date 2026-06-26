import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

class TestResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;
  private observed = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.observed.add(target);

    window.setTimeout(() => {
      if (!this.observed.has(target)) {
        return;
      }

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
    });
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.observed.clear();
  }
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  configurable: true,
  value: TestResizeObserver,
});

class TestStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

Object.defineProperty(window, "localStorage", {
  writable: true,
  configurable: true,
  value: new TestStorage(),
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

Object.defineProperty(window, "scrollTo", {
  writable: true,
  configurable: true,
  value: () => {},
});

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  writable: true,
  configurable: true,
  value: () => [],
});
