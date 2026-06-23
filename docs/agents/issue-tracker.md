# Issue tracker: Multica

Issues, PRDs, and tasks for this repo live in **Multica** — the agent-orchestration platform that drives the EverWard Works squad — managed via the `multica` CLI. PRDs that need a durable, version-controlled home stay in the repo (`.scratch/<feature>/PRD.md`); implementation issues live in Multica and reference the PRD by repo path.

## CLI

- Binary: `multica` (on `PATH` after `multica setup`; otherwise `~/Library/Application Support/Multica/bin/multica`).
- Requires `multica setup` (auth) and a running daemon (`multica daemon start`).
- Every command accepts `--output json` — use it for parsing.
- This repo's project is **Pig** (`--project 1cf7aebb-59c2-43a3-8150-343452ee69f9`).
- The squad is **EverWard Works** (`--assignee-id b26e06b0-0919-48c1-8aaf-e03f49aa7723`).

## When a skill says "publish to the issue tracker"

Create a flat issue in the Pig project (no parent/child layer — slices are independent, dependencies are expressed via status + a "Blocked by" note in the description):

```
multica issue create \
  --title "<title>" \
  --description-file <path-to-markdown> \
  --project 1cf7aebb-59c2-43a3-8150-343452ee69f9 \
  --assignee-id b26e06b0-0919-48c1-8aaf-e03f49aa7723 \
  --status <todo|blocked> \
  --output json
```

Then apply the triage label (the `create` command has no `--label` flag):

```
multica issue label add <issue-id> <label-id>   # see triage-labels.md for IDs
```

- Use `--description-file` (or `--description-stdin`) to preserve multi-line markdown verbatim.
- Set `--status todo` for an issue ready to start, `--status blocked` for one waiting on a predecessor.
- Capture the returned issue `id` from the JSON.

## When a skill says "fetch the relevant ticket"

- One issue: `multica issue get <id> --output json`
- Browse: `multica issue list --project 1cf7aebb-59c2-43a3-8150-343452ee69f9 --output json`
- Find: `multica issue search "<query>"`

The user will normally pass the issue ID directly.

## Triage state vs. execution status

Two orthogonal axes:

- **Execution status** (Multica native): `backlog, todo, in_progress, in_review, done, blocked, cancelled` — set via `multica issue status <id> <status>`.
- **Triage role** (the five canonical roles): applied as **labels** via `multica issue label add` / `remove` (see `triage-labels.md`).

An issue can be `ready-for-agent` (spec complete) while still `blocked` (waiting on a dependency) — the two axes don't conflict.

## Dependencies between issues

There is no parent/child hierarchy. A "Blocked by" relationship is recorded in the issue description and reflected by setting the dependent issue's status to `blocked` until its predecessor reaches `done`.

## Assignment

Assign work to the squad (Atlas, the leader, routes internally) with:

```
multica issue assign <id> --to-id b26e06b0-0919-48c1-8aaf-e03f49aa7723
```
