# Security Policy

## Supported versions

Pace is in `0.y.z` initial development. Only the **latest published GitHub Release** is supported. Older `0.y.z` releases do not receive security backports.

## Reporting a vulnerability

Do not open a public GitHub issue for security reports.

1. Prefer GitHub's **Report a vulnerability** private advisory on [BubblePtr/pace](https://github.com/BubblePtr/pace/security/advisories/new).
2. If that is unavailable, email `oldmeatovo@gmail.com`.

We aim to acknowledge a report within 7 days. After that we will say whether we accept it, ask for more detail, or explain why it is out of scope. Please give us time to ship a fix before any public disclosure.

## Scope

Pace is a desktop host that runs the [Pi coding agent](https://pi.dev) locally as an isolated subprocess. Report vulnerabilities in Pace's Electron shell, Runtime Gateway, persistence, packaging, or updater here.

Report issues in Pi's runtime, session log, tools, or extension system to the [Pi project](https://pi.dev), not to Pace.
