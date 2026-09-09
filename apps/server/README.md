# @pace/server (planned)

Headless Pace backend. Wraps `@pace/backend` (`createBackendService`) and binds it
to a WebSocket transport so remote clients (`@pace/web`, future mobile) can drive
Pi over the network — the same service the desktop runs locally in its
utilityProcess. The backend always operates on its own local filesystem; "local
vs VPS" is just where this server runs.

Not yet implemented. See [ADR-0015](../../docs/adr/0015-multi-app-monorepo.md).
