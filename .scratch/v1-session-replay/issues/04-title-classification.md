# 04 — Title classification chips

Status: done
Blocked by: 01

## Parent

[PRD: Pig V1 — Session Replay](../PRD.md)

## What to build

Replace the raw first-message titles from slice 01 with classified, typed titles. A pure Rust function `classify_title(first_user_message) → Title` branches on the shape of the first user message:

- **Slash command** (`/grilling …`) → a command chip (`⚡ grilling`) with the trailing arguments as subtitle
- **Skill invocation** (`<skill name="kami">…`) → a skill chip (`🧩 kami`)
- **Natural language** → the first complete sentence (sentence-aware truncation — never cut mid-word)
- **Trivial** (`hi`, `echo test`, `/exit`) → raw text as-is; these are genuinely low-value and sink to the list bottom by their low cost

`Title` is a tagged enum (`Command { name, args }` | `Skill { name }` | `Text { sentence }` | `Raw { text }`). The list renders each variant appropriately (chips for command/skill, clean sentence for text).

## Acceptance criteria

- [ ] Sessions starting with a slash command render a command chip with arguments as subtitle
- [ ] Sessions starting with a `<skill name="…">` tag render a skill chip
- [ ] Natural-language sessions show the first complete sentence with no mid-word truncation
- [ ] Trivial sessions show their raw first message unchanged
- [ ] `classify_title` is covered by its own unit tests across all four branches plus truncation edge cases
- [ ] The list view renders each `Title` variant with the correct visual treatment

## Blocked by

- [01 — Walking skeleton: session list](./01-session-list-skeleton.md)
