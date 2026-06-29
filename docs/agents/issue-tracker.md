# Issue tracker: in-repo markdown

Issues and PRDs for this repo live **in the repo** as markdown under `.scratch/<feature>/`. There is no external issue tracker.

## Layout

```
.scratch/<feature>/
├── PRD.md                    # the feature PRD (problem, solution, decisions, scope)
├── issues.md                 # all slices for the feature in one file, OR
└── issues/
    ├── 01-<slug>.md          # one slice per file, dependency-ordered
    └── 02-<slug>.md
```

Either layout is fine: a single `issues.md` with `## Issue N: …` sections, or an `issues/` directory with one numbered file per slice. Slices are independent tracer bullets; order them by dependency.

## Issue shape

Each issue/slice is a self-contained implementation brief that carries only what an agent needs to act cold: a link to its PRD, the user stories it covers, what to build, and acceptance criteria. Front matter:

```
Status: <triage role | done>    # triage role while pending; `done` once implemented
Source PRD: .scratch/<feature>/PRD.md
```

`Status:` carries a triage role (see `triage-labels.md`) while the slice is pending, and `done` once it has shipped. With no external tracker, this line is the only record of execution status — keep it current when a slice lands.

## When a skill says "publish to the issue tracker"

Write the issue as markdown under the feature's `.scratch/<feature>/issues[/]` and set its `Status:` to the appropriate triage role (usually `ready-for-agent`). Commit it with the rest of the docs.

## Dependencies between issues

No parent/child hierarchy. Express a dependency with a "Blocked by: Issue N" note in the issue body and order the files by their numeric prefix; a slice is implicitly blocked until its predecessor is implemented.
