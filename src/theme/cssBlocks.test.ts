import { expect, it } from "vitest";
import { cssBlock } from "./cssBlocks";

const css = `
:root { --a: 1; }
@media (prefers-reduced-transparency: reduce) {
  :root { --a: 2; }
}
`;

it("refuses a selector found twice instead of taking the first one", () => {
  expect(() => cssBlock(css, ":root")).toThrow(/twice|more than once/);
});

it("reads a rule inside the at-rule it is asked for", () => {
  expect(cssBlock(css, ":root", "@media (prefers-reduced-transparency: reduce)")).toEqual({ "--a": "2" });
  expect(() => cssBlock(css, ":root", "@media (nope)")).toThrow();
});

it("reads a rule that is alone", () => {
  expect(cssBlock(":root[data-x] { --b: 3; }", ":root[data-x]")).toEqual({ "--b": "3" });
});
