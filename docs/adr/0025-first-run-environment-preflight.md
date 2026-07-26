# ADR-0025: First-run environment preflight

## Status

Accepted (2026-07-25)

## Context

M5.1 made PiGUI installable. Clean Mac users can still open a blank workspace without knowing Pi, credentials, or data-directory permissions are missing. Setup remains a read-only inventory.

Frozen product rules from #PiGUI wireframe review:

1. Required checks: Pi runtime, data directory writable, model auth present
2. Optional: Git (never blocks Continue)
3. Required FAIL must be fixed and Rechecked before Continue
4. Gate once on first launch; later re-run only from Setup

## Decision

- Add backend methods `run_environment_preflight`, `get_environment_preflight_status`, and `complete_environment_preflight`.
- Persist completion in `<PIGUI_DATA_DIR>/preflight-status.json`.
- Renderer root gate redirects to `/preflight` until `completedAt` is set.
- Do not silently install CLIs or mutate global Pi config.
- Do not force a live LLM test Session in v0.1.

## Consequences

- Existing Electron E2E seeds a completed preflight status so unrelated suites stay on the main UI.
- M5.2 E2E covers first-run gate pass and auth-failure block paths.
