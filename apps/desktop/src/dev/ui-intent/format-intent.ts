/**
 * Build the paste-ready "intent block" for a picked UI target. The block is
 * the deliverable of the picker: the user pastes it into an agent prompt and
 * types their change after `Change I want:`.
 */

import type { ComponentStackEntry } from "./fiber-stack";
import type { UiRegionMatch } from "./regions";

export type IntentTarget = {
  region: UiRegionMatch | null;
  stack: ComponentStackEntry[];
  /** Headline component: the innermost app (non-library) component. */
  component: {
    name: string;
    /** Where the component's own render output lives (its file). */
    definition: { file: string | null; line: number | null };
    /** Where the component was rendered from (usage site in the parent). */
    usage: { file: string | null; line: number | null };
  } | null;
  testId: string | null;
};

const MAX_STACK_ROWS = 8;

function at(file: string | null, line: number | null): string | null {
  if (!file) {
    return null;
  }

  return line ? `${file}:${line}` : file;
}

export function formatIntentBlock(target: IntentTarget): string {
  const lines: string[] = ["UI target (picked from the running PiGUI app):", ""];

  if (target.region) {
    lines.push(
      `- Region: \`${target.region.region.term}\` — CONTEXT.md term "**${target.region.region.term}**:" (matched via ${target.region.via})`,
    );
  } else {
    lines.push(
      "- Region: (no CONTEXT.md region matched — see the component stack below; consider adding a binding to `apps/desktop/src/dev/ui-intent/regions.ts`)",
    );
  }

  const element = target.stack.find((entry) => entry.kind === "element");
  if (element) {
    const location = at(element.file, element.line);
    lines.push(`- Clicked element: \`<${element.name}>\`${location ? ` — ${location}` : ""}`);
  }

  if (target.component) {
    const definition = at(target.component.definition.file, target.component.definition.line);
    const usage = at(target.component.usage.file, target.component.usage.line);
    const parts = [
      `- Component: \`${target.component.name}\``,
      definition ? `defined at ${definition}` : null,
      usage && usage !== definition ? `rendered at ${usage}` : null,
    ].filter(Boolean);
    lines.push(parts.join(" — "));
  }

  const components = target.stack.filter((entry) => entry.kind === "component");
  if (components.length > 0) {
    lines.push("- Component stack (innermost → outermost):");
    for (const entry of components.slice(0, MAX_STACK_ROWS)) {
      const location = at(entry.file, entry.line);
      const libraryNote = entry.library ? " (library)" : "";
      lines.push(`  - \`${entry.name}\`${libraryNote}${location ? ` — ${location}` : ""}`);
    }
    if (components.length > MAX_STACK_ROWS) {
      lines.push(`  - … (${components.length - MAX_STACK_ROWS} more)`);
    }
  }

  if (target.testId) {
    lines.push(`- Nearest data-testid: \`${target.testId}\``);
  }

  lines.push("", "Change I want: ");

  return lines.join("\n");
}
