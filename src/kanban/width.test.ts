import { describe, expect, it } from "vitest";
import { kanbanWidth } from "./width";

describe("kanbanWidth", () => {
  it("keeps the default width for an empty board", () => {
    expect(kanbanWidth(0)).toBe(640);
  });

  it("adds one column and its gutter each time", () => {
    expect(kanbanWidth(1)).toBe(502);
    expect(kanbanWidth(4) - kanbanWidth(3)).toBe(252);
  });

  it("fits the columns, the gutters and the add button", () => {
    expect(kanbanWidth(3)).toBe(2 + 24 + 3 * 252 + 224);
  });
});
