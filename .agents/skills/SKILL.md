---
name: heroui-react-pro
description: "HeroUI Pro React component library. Use when building UIs with @heroui-pro/react — charts, forms, navigation, overlays, data display. Teaches compound component patterns, MCP tool usage, v3 conventions, and the CSS styling system. Keywords: HeroUI Pro, @heroui-pro/react, Pro components, Pro MCP."
metadata:
  author: heroui
  version: "1.0.0"
---

# HeroUI Pro React Development Guide

`@heroui-pro/react` is a premium component library built on **Tailwind CSS v4** and **React Aria Components**. It extends `@heroui/react` (the base library) with AI chat surfaces, charts, advanced forms, navigation, overlays, and data display components.

## Skills Teach, MCP Does

This skill teaches your agent **how** to write HeroUI code correctly. For **live data** (component docs, CSS files, theme variables), use the **HeroUI Pro MCP server** (`heroui-pro` at `mcp.heroui.pro`).

The Pro MCP is a **unified server** — it covers both `@heroui-pro/react` (Pro) and `@heroui/react` (OSS). You do NOT need a separate OSS MCP installed.

| Tool                        | When to use                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `list_components`           | Discover all components — both `@heroui-pro/react` and `@heroui/react` in one call    |
| `get_component_docs`        | Get compound API, anatomy, props, examples for any Pro or OSS component               |
| `get_css`                   | Pro CSS system + OSS BEM styles (`components: [...]`) + Pro theme variants (`theme:`) |
| `get_docs`                  | Read installation, theming, styling, composition guides for both packages             |
| `get_component_source_code` | View OSS component source code (Pro source not exposed)                               |
| `get_theme_variables`       | Get OSS default theme tokens (use `get_css()` for Pro tokens)                         |

**Always call `list_components` first to get the up-to-date component list, then `get_component_docs` before implementing.** The component categories listed in this skill are a reference snapshot — new components are added regularly. The MCP `list_components` tool always returns the current list. If a component name is not in the MCP response, it does not exist yet. Never guess or hallucinate component names.

---

## Two Packages, One MCP

| Package             | What it contains                                                           |
| ------------------- | -------------------------------------------------------------------------- |
| `@heroui/react`     | Base components: Button, Card, Modal, TextField, Tabs, Accordion, etc.     |
| `@heroui-pro/react` | Pro components: AI chat, charts, forms, navigation, overlays, data display |

Both packages are served by the single `heroui-pro` MCP. Import from the correct package:

```tsx
import {Button, Card, Modal} from "@heroui/react";
import {Sidebar, Command, Sheet, KPI} from "@heroui-pro/react";
```

---

## Critical v3 Rules

- **Tailwind CSS v4 required** — v3 is NOT supported
- **No Provider needed** — components work directly without `<HeroUIProvider>`
- **Compound components** — use dot notation (`Sheet.Trigger`, `Sheet.Content`, `Card.Header`)
- **`onPress` not `onClick`** — for accessibility
- **Import order matters** — Tailwind CSS before HeroUI styles in CSS

```css
@import "tailwindcss";
@import "@heroui/styles";
```

---

## Pro Component Categories

> This list is a snapshot of **Pro** components for reference. Always call `list_components` via the MCP to get the current list — it returns both Pro and OSS components in a single sectioned response. New components are added regularly.

### Charts

AreaChart, BarChart, LineChart, PieChart, RadarChart, RadialChart, ComposedChart, ChartTooltip

### Data Display

Agenda, ActionBar, Carousel, DataGrid, EmptyState, FileTree, FloatingToc, HoverCard, Kanban, ItemCard, ItemCardGroup, KPI, KPIGroup, ListView, Widget

### AI

ChainOfThought, ChatAttachment, ChatConversation, ChatListView, ChatLoader, ChatMessage, ChatMessageActions, ChatSource, ChatTool, CodeBlock, Markdown, PromptInput, PromptSuggestion, TextShimmer

### Forms

CellColorPicker, CellSelect, CellSlider, CellSwitch, CheckboxButtonGroup, DropZone, InlineSelect, NativeSelect, NumberStepper, RadioButtonGroup

### Navigation

AppLayout, Command, ContextMenu, Navbar, Segment, Sidebar, Stepper

### Overlays

EmojiPicker, Sheet

### Feedback

EmojiReactionButton, NumberValue, PressableFeedback, Rating, TrendChip

### Layout

Resizable

---

## Key Rules

- Import from `"@heroui/react"` for base components, `"@heroui-pro/react"` for Pro
- Subcomponents via **dot notation**: `Card.Header`, `Sheet.Content`, `Sidebar.Header`
- Use `onPress` not `onClick` for Button
- `Divider` does NOT exist — use `Separator`
- `CardHeader`/`CardContent`/`CardFooter` as direct imports do NOT exist — use `Card.Header` etc.
- Icons: `import { Icon } from "@iconify/react"` with the gravity-ui icon set

### Semantic Variants

- Button: `variant="primary"` (default), `"secondary"`, `"tertiary"`, `"outline"`, `"ghost"`, `"danger"`, `"danger-soft"`
- Sizes: `size="sm"`, `"md"` (default), `"lg"`
- States: `isDisabled`, `isPending`, `isIconOnly`, `fullWidth`

### Switch Component (v3 anatomy)

Always use the dot notation anatomy:

```tsx
import { Switch, Label } from "@heroui/react";

<Switch defaultSelected aria-label="Auto-Lock Doors">
  <Switch.Control>
    <Switch.Thumb />
  </Switch.Control>
</Switch>

<Switch>
  <Switch.Control>
    <Switch.Thumb />
  </Switch.Control>
  <Switch.Content>
    <Label className="text-sm">Enable notifications</Label>
  </Switch.Content>
</Switch>
```

---

## Design Tokens

- Backgrounds: `bg-background`, `bg-surface`, `bg-surface-secondary`, `bg-overlay`
- Text: `text-foreground`, `text-muted`
- Brand: `bg-accent`, `text-accent-foreground`
- Status: `text-success`, `text-warning`, `text-danger` (each with `-foreground`)
- Borders: `border-border`, `border-separator`
- Shadows: `shadow-surface`, `shadow-overlay`
- All colors use oklch color space via CSS variables
- No numbered tokens (`default-100`, `primary-500`) — these are v2 and do NOT exist

---

## CSS System

The `get_css` MCP tool exposes CSS from both `@heroui-pro/react` and `@heroui/react`:

- **Pro base variables** — design tokens for colors, spacing, radius, shadows
- **Pro + OSS component styles** — BEM classes with state selectors and modifiers
- **Pro theme variants** (e.g. brutalism) — variables, fonts, and component overrides

```
get_css()                                    → overview of tokens + available Pro/OSS styles/themes
get_css({ components: ["sheet", "sidebar"] }) → Pro BEM CSS for those components
get_css({ components: ["button", "card"] })  → OSS BEM CSS for those components
get_css({ theme: "brutalism" })               → full Pro theme variant CSS
```

For OSS-specific theme variables (actual token values), use `get_theme_variables()` instead.

---

## Components That DONT EXIST — NEVER Use

Divider (use Separator), SelectItem, Progress (use ProgressBar), CardHeader/CardContent/CardFooter as direct imports — use dot notation `Card.Header`/`Card.Content`/`Card.Footer`

## Past Corrections (ALWAYS follow these)

- Switch must use dot notation anatomy (`Switch.Control > Switch.Thumb`); never the old `<Switch>Label</Switch>`
- Never apply `shadow-overlay` to Card — Card already includes `shadow-surface` by default
- Wrap Dropdown triggers in a ghost-variant Button (`variant='ghost'`)
- Use `variant='outline'` (not `'outlined'`) for outlined button styles
- Use `variant='danger-soft'` as a single prop for destructive buttons (not `color='danger' variant='soft'`)
- Use HeroUI's built-in components (ColorSwatchPicker, DatePicker, Calendar, CircularProgress) over custom implementations
- Use `ScrollShadow` with `overflow-y-auto` and `max-h` for scrollable lists
- Apply `rounded-2xl` to match HeroUI's default border-radius convention
- Use `no-underline` class on breadcrumb links
