import { render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { describe, expect, it } from "vitest";
import { buildComponentTree } from "./component-tree";
import { fiberFromElement } from "./fiber-stack";

function Leaf() { return <button data-testid="leaf">leaf</button>; }
function Peer() { return <aside>peer</aside>; }
function Branch() { return <section><Leaf /><Peer /></section>; }
function Root() { return <main><Branch />{createPortal(<Peer />, document.body)}</main>; }

describe("component tree snapshot", () => {
  it("keeps siblings and portal children while flattening host elements", () => {
    render(<Root />);
    const tree = buildComponentTree(fiberFromElement(screen.getByTestId("leaf"))!);
    expect(tree.roots.map(node => node.entry.name)).toEqual(["Root"]);
    const root = tree.roots[0];
    expect(root.children.map(node => node.entry.name)).toEqual(["Branch", "Peer"]);
    expect(root.children[0].children.map(node => node.entry.name)).toEqual(["Leaf", "Peer"]);
    expect(root.expanded).toBe(true);
    expect(root.children[0].expanded).toBe(true);
    expect(root.children[0].children[0].expanded).toBe(false);
  });

  it("retains the picked path when the snapshot budget is exhausted", () => {
    render(<Root />);
    const tree = buildComponentTree(fiberFromElement(screen.getByTestId("leaf"))!, { limit: 1 });
    expect(tree.truncated).toBe(true);
    expect(tree.roots[0].children[0].children[0].entry.name).toBe("Leaf");
  });

  it("can exclude the picker subtree", () => {
    render(<Root />);
    const tree = buildComponentTree(fiberFromElement(screen.getByTestId("leaf"))!, {
      exclude: fiber => fiber.type === Peer,
    });
    expect(tree.roots[0].children.map(node => node.entry.name)).toEqual(["Branch"]);
    expect(tree.roots[0].children[0].children.map(node => node.entry.name)).toEqual(["Leaf"]);
  });
});

it("opens the committed path when React retains an alternate fiber on the DOM", () => {
  const old = { type: function Leaf() {}, child: null, sibling: null, return: null };
  const current = { ...old, alternate: old };
  const root = { type: function Root() {}, child: current, sibling: null, return: null };
  Object.assign(old, { return: root });
  const tree = buildComponentTree(old);
  expect(tree.roots[0].expanded).toBe(true);
  expect(tree.selectedId).toBe(tree.roots[0].children[0].id);
});
