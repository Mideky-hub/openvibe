import { expect, it } from "vitest";
import { createNodeElement } from "./nodeElement";
import { findTerminalAt } from "./hitTest";

// Terminals are 720x440; centered on (360, 220) they span x 0..720, y 0..440.
const at = (x: number, y: number) => createNodeElement("terminal", { x: x + 360, y: y + 220 });

it("finds the terminal under the point", () => {
  const terminal = at(0, 0);
  expect(findTerminalAt([terminal], 10, 10)).toBe(terminal);
  expect(findTerminalAt([terminal], 800, 10)).toBeNull();
});

it("prefers the topmost terminal when two overlap", () => {
  const below = at(0, 0);
  const above = at(100, 100);
  expect(findTerminalAt([below, above], 200, 200)).toBe(above);
});

it("skips deleted terminals and other node kinds", () => {
  const deleted = { ...at(0, 0), isDeleted: true };
  const note = createNodeElement("note", { x: 10, y: 10 });
  expect(findTerminalAt([deleted, note], 10, 10)).toBeNull();
});

it("ignores a terminal that a folded group keeps hidden (locked)", () => {
  const hidden = { ...at(0, 0), locked: true };
  expect(findTerminalAt([hidden], 10, 10)).toBeNull();
});
