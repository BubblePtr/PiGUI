# Triage Labels

The skills speak in terms of five canonical triage roles. In Multica these are **labels** (orthogonal to the native execution status — see `issue-tracker.md`), applied via `multica issue label add <issue-id> <label-id>`.

| Role              | Multica label name | Label ID                               | Meaning                                  |
| ----------------- | ------------------ | -------------------------------------- | ---------------------------------------- |
| `needs-triage`    | `needs-triage`     | `62cf7524-9097-4225-ac31-5c2f49ba76d2` | Maintainer needs to evaluate this issue  |
| `needs-info`      | `needs-info`       | `b7377df1-53f9-422c-bdf2-cd7be13806a9` | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent`  | `5c639d33-3436-47d5-985a-27c393627c18` | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human`  | `89026cf0-86a4-460a-b914-68cd0a510ded` | Requires human implementation            |
| `wontfix`         | `wontfix`          | `1cda9ee5-24f8-4bb3-ad4f-2216795107d7` | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), look up the label ID here and apply it with `multica issue label add`. Remove with `multica issue label remove`.
