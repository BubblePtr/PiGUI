/**
 * CONTEXT.md term ↔ code binding table for the dev-only UI intent picker.
 *
 * Each entry binds a precisely-defined product region (the `**Term**:` entries
 * in the repo-root CONTEXT.md) to the code that implements it: component
 * display names, `data-testid` values, or CSS selectors on the rendered DOM.
 *
 * DRIFT RULE (mirrors the design-page rule in AGENTS.md): when you rename or
 * move a region-level component, update this table in the same PR. A test
 * asserts every `term` still exists as a heading in CONTEXT.md.
 */

import type { ComponentStackEntry } from "./fiber-stack";

export type UiRegion = {
  /** Exact `**Term**:` heading text from CONTEXT.md. */
  term: string;
  match: {
    /** Fiber display names, e.g. "PiTraceLedger". */
    components?: string[];
    /** `data-testid` values on the target element or its DOM ancestors. */
    testIds?: string[];
    /** CSS selectors matched against the target element or its DOM ancestors. */
    selectors?: string[];
  };
};

export const uiRegions: UiRegion[] = [
  {
    term: "Project Sidebar",
    match: { components: ["ProjectNavigation"], testIds: ["sidebar-projects"] },
  },
  {
    term: "Trace Cockpit",
    match: { components: ["SessionDetailView"], testIds: ["session-detail-view"] },
  },
  {
    term: "Strip",
    match: { components: ["PiTraceStrip"] },
  },
  {
    term: "Tally",
    match: { selectors: ['[data-slot="trace-tally"]'] },
  },
  {
    term: "Ledger",
    match: { components: ["PiTraceLedger"] },
  },
  {
    term: "Inspector",
    match: {
      components: ["PiTraceInspector", "SessionInspector"],
      testIds: ["session-inspector"],
    },
  },
  {
    term: "Playhead",
    match: { selectors: ["[data-playhead]"] },
  },
  {
    term: "Live Session View",
    match: {
      components: [
        "LiveSessionColumn",
        "AgentWorkspaceSessionsView",
        "AgentWorkspaceSessionsPage",
        "LiveChatMessage",
      ],
    },
  },
  {
    term: "Analyze",
    match: { components: ["UsagePage", "TraceIndexPage"] },
  },
  {
    term: "Project Selector",
    match: { components: ["ProjectPicker"] },
  },
  {
    term: "Structured Action Surface",
    match: { components: ["SessionChangesPanel", "SessionSurfaceContent"] },
  },
  {
    term: "Session Draft",
    match: { components: ["SessionDraftComposer"] },
  },
  {
    term: "Follow-up Draft",
    match: { components: ["FullChatComposer"] },
  },
  {
    term: "Queued Message",
    match: { components: ["QueuedMessageList", "ChatQueuedMessage"], testIds: ["chat-queued-message"] },
  },
  {
    term: "Unsent Follow-up Indicator",
    match: { components: ["UnsentFollowUpIndicator"] },
  },
  {
    term: "Unread Result Indicator",
    match: { components: ["SidebarSessionGlyph"], selectors: ['[aria-label="Unread result"]'] },
  },
];

export type UiRegionMatch = {
  region: UiRegion;
  /** Which matcher produced the hit — useful context for the pasted block. */
  via: "component" | "testid" | "selector";
};

function elementRegionMatch(element: Element): UiRegionMatch | null {
  for (const region of uiRegions) {
    const testId = element.getAttribute("data-testid");
    if (testId && region.match.testIds?.includes(testId)) {
      return { region, via: "testid" };
    }

    if (region.match.selectors?.some((selector) => element.matches(selector))) {
      return { region, via: "selector" };
    }
  }

  return null;
}

/**
 * Find the region a picked element belongs to, most specific first:
 * 1. attributes on the clicked element itself,
 * 2. component names along the fiber stack (innermost → outermost),
 * 3. attributes on DOM ancestors (nearest → farthest).
 */
export function matchRegion(
  stack: ComponentStackEntry[],
  target: Element | null,
): UiRegionMatch | null {
  if (target) {
    const own = elementRegionMatch(target);
    if (own) {
      return own;
    }
  }

  for (const entry of stack) {
    if (entry.kind !== "component") {
      continue;
    }

    for (const region of uiRegions) {
      if (region.match.components?.includes(entry.name)) {
        return { region, via: "component" };
      }
    }
  }

  let ancestor = target?.parentElement ?? null;
  while (ancestor) {
    const match = elementRegionMatch(ancestor);
    if (match) {
      return match;
    }

    ancestor = ancestor.parentElement;
  }

  return null;
}
