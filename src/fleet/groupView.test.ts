import { expect, it } from "vitest";
import { readableTargets } from "./groupView";

const box = (x: number, y: number, width = 600, height = 400) => ({ x, y, width, height });
const viewport = { width: 1400, height: 800 };

it("fits a group that stays readable", () => {
  const frame = box(0, 0, 1000, 600);
  expect(readableTargets(frame, [box(0, 0), box(620, 0)], viewport)).toEqual([frame]);
});

it("shows only the start of a large group instead of fitting it at 40 %", () => {
  const frame = box(0, 0, 2640, 1640);
  const cells = [box(20, 20), box(660, 20), box(1300, 20), box(1940, 20)];
  const shown = readableTargets(frame, cells, viewport);
  expect(shown).toEqual(cells.slice(0, 3));
});
