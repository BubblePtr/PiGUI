# Triage roles

The skills speak in terms of five canonical triage roles. In this repo they are expressed as the `Status:` value in an issue's front matter (see `issue-tracker.md`) — there is no external label system.

| Role              | Meaning                                  |
| ----------------- | ---------------------------------------- |
| `needs-triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`      | Waiting on reporter for more information |
| `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human` | Requires human implementation            |
| `wontfix`         | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), set the issue's `Status:` to that role.
