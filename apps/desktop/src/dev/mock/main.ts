import { addProjectToRegistry } from "@/entities/project/project-registry";
import { createMockApi, mockProject } from "./scenarios";
import { DEFAULT_THEMES, preloadHighlighter } from "@pierre/diffs";

if (!import.meta.env.DEV || import.meta.env.MODE !== "mock" || window.pace) {
  throw new Error(
    "Static mock requires the dedicated browser development server.",
  );
}

window.pace = createMockApi();
addProjectToRegistry(mockProject);
document.title = "Pace · Static Mock";
if (!window.location.hash) {
  window.location.hash = `/projects/${encodeURIComponent(mockProject)}/sessions`;
}
// Cold highlighter loading races StrictMode remounts in the diff renderer.
// Warm only fixture languages; the production bootstrap stays untouched.
void preloadHighlighter({
  themes: [DEFAULT_THEMES.light, DEFAULT_THEMES.dark],
  langs: ["typescript", "markdown", "text"],
}).then(() => import("@/app/main"));
