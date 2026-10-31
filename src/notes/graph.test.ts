import { describe, expect, it } from "vitest";
import { layoutGraph, neighbours, fitView, zoomAt } from "./graph";

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("the graph's layout (spec notes §3)", () => {
  const names = ["a", "b", "c", "d", "e"];
  const links = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
  ];

  it("places every note", () => {
    expect(Object.keys(layoutGraph(names, links)).sort()).toEqual(names);
  });

  it("gives the same picture for the same notes", () => {
    expect(layoutGraph(names, links)).toEqual(layoutGraph(names, links));
  });

  it("does not depend on the order of the notes", () => {
    const layout = layoutGraph(names, links);
    const reversed = layoutGraph([...names].reverse(), links);
    expect(reversed.a.x).toBeCloseTo(layout.a.x);
  });

  it("brings linked notes closer than unlinked ones", () => {
    const layout = layoutGraph(names, links);
    expect(distance(layout.a, layout.b)).toBeLessThan(distance(layout.a, layout.e));
  });

  it("keeps notes apart", () => {
    const layout = layoutGraph(names, links);
    const points = Object.values(layout);
    for (const p of points) for (const q of points) if (p !== q) expect(distance(p, q)).toBeGreaterThan(10);
  });

  it("copes with no note, one note, and notes without links", () => {
    expect(layoutGraph([], [])).toEqual({});
    expect(layoutGraph(["only"], []).only).toEqual({ x: 0, y: 0 });
    const free = layoutGraph(["a", "b"], []);
    expect(Number.isFinite(free.a.x)).toBe(true);
  });

  it("stays finite for a large notebook", () => {
    const many = Array.from({ length: 300 }, (_, i) => `n${i}`);
    const chained = many.slice(1).map((name, i) => ({ from: many[i], to: name }));
    expect(Object.values(layoutGraph(many, chained)).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe("hovering", () => {
  it("names a note and those it is linked to, both ways", () => {
    expect(neighbours("b", [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }])).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("the view", () => {
  it("frames every note in the viewport", () => {
    const view = fitView({ a: { x: -100, y: 0 }, b: { x: 100, y: 0 } }, { width: 400, height: 300 });
    expect(view.x + -100 * view.scale).toBeGreaterThanOrEqual(0);
    expect(view.x + 100 * view.scale).toBeLessThanOrEqual(400);
    expect(view.y).toBeCloseTo(150);
  });

  it("does not blow up a lone note", () => {
    expect(fitView({ a: { x: 0, y: 0 } }, { width: 400, height: 300 })).toEqual({ x: 200, y: 150, scale: 1 });
  });

  it("zooms around the pointer", () => {
    const before = { x: 10, y: 20, scale: 1 };
    const after = zoomAt(before, { x: 110, y: 120 }, 2);
    expect(after.scale).toBe(2);
    expect((110 - after.x) / after.scale).toBeCloseTo((110 - before.x) / before.scale);
    expect((120 - after.y) / after.scale).toBeCloseTo((120 - before.y) / before.scale);
  });

  it("stops at its limits", () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0 }, 100).scale).toBe(3);
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0 }, 0.001).scale).toBe(0.2);
  });
});
