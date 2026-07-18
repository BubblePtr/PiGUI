# PiGUI E2E Tests

Playwright-based end-to-end tests that launch the real Electron desktop app
and verify behavior through the UI.

## Prerequisites

```bash
# Build the Electron app first
bun run build

# Install Playwright browsers (Chromium is bundled with Electron, so this is for the test runner)
npx playwright install chromium
```

## Running

```bash
# All E2E tests
npx playwright test --config e2e/playwright.config.ts

# Specific test
npx playwright test --config e2e/playwright.config.ts e2e/smoke/m1-fixture-free.spec.ts

# Headed mode (see the window)
npx playwright test --config e2e/playwright.config.ts --headed

# Debug mode
npx playwright test --config e2e/playwright.config.ts --debug
```

## Test Architecture

```
e2e/
  playwright.config.ts     # Playwright config
  fixtures/
    electron-app.ts        # Launch helpers + fixture detection
  smoke/
    m1-fixture-free.spec.ts  # M1/M2 smoke tests
  screenshots/             # Auto-saved screenshots
```

## Layers

| Layer | Framework | Scope |
|-------|-----------|-------|
| E2E | Playwright + Electron | Real desktop app, full stack |
| Integration | Vitest + jsdom | Component + backend integration |
| Unit | Vitest | Pure function / module tests |

## Pi Runtime Mocking

E2E tests should NOT call a real LLM. Two strategies:

1. **FakePiRuntime** (in-memory) — for fast smoke tests
2. **Pi SDK Spy** — records RPC calls for contract verification

Both are triggered by environment variables the backend reads at startup.
