import { entryFromFiber, type ComponentStackEntry, type FiberLike } from "./fiber-stack";

export type ComponentTreeNode = {
  id: string;
  entry: ComponentStackEntry;
  children: ComponentTreeNode[];
  expanded: boolean;
};
export type ComponentTreeSnapshot = { roots: ComponentTreeNode[]; truncated: boolean; selectedId?: string; selectedPath: ComponentTreeNode[] };

/** Capture once per pick so inspecting a busy app does not continuously rebuild its tree. */
export function buildComponentTree(
  picked: FiberLike,
  { limit = 20000, exclude = () => false }: { limit?: number; exclude?: (fiber: FiberLike) => boolean } = {},
): ComponentTreeSnapshot {
  const path = new Set<FiberLike>();
  let root = picked;
  let selected: FiberLike | null = null;
  for (let node: FiberLike | null = picked; node && !path.has(node); node = node.return) {
    path.add(node);
    root = node;
    if (!selected && entryFromFiber(node)?.kind === "component") selected = node;
  }

  for (const node of [...path]) if (node.alternate) path.add(node.alternate);
  const snapshot: ComponentTreeSnapshot = { roots: [], truncated: false, selectedPath: [] };
  const pending = [{ fiber: root, into: snapshot.roots, depth: 0, trail: [] as ComponentTreeNode[] }];
  const seen = new Set<FiberLike>();
  let count = 0;
  while (pending.length) {
    const { fiber, into, depth, trail } = pending.pop()!;
    if (seen.has(fiber)) continue;
    seen.add(fiber);
    if (fiber.sibling) pending.push({ fiber: fiber.sibling, into, depth, trail });
    if (exclude(fiber)) continue;
    // Always preserve the picked path, even when unrelated branches exhaust the budget.
    if ((count++ >= limit || depth >= 150) && !path.has(fiber)) {
      snapshot.truncated = true;
      continue;
    }
    const entry = entryFromFiber(fiber);
    let children = into;
    let childDepth = depth;
    let childTrail = trail;
    if (entry?.kind === "component") {
      const node: ComponentTreeNode = {
        id: `component-${seen.size}`,
        entry,
        children: [],
        expanded: false,
      };
      into.push(node);
      childTrail = [...trail, node];
      if (fiber === selected || fiber.alternate === selected || selected?.alternate === fiber) {
        snapshot.selectedId = node.id;
        snapshot.selectedPath = childTrail;
      }
      children = node.children;
      childDepth++;
    }
    // Host elements, fragments and portals are transparent in the component tree.
    if (fiber.child) pending.push({ fiber: fiber.child, into: children, depth: childDepth, trail: childTrail });
  }
  for (const node of snapshot.selectedPath.slice(0, -1)) node.expanded = true;
  return snapshot;
}
