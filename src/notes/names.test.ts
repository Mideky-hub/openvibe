import { describe, expect, it } from "vitest";
import { isNoteName } from "./names";

describe("note names (spec notes §3)", () => {
  it("takes names with spaces and accents", () => {
    for (const name of ["Auth", "décisions d'archi", "v1.2 notes", "a-b_c"]) expect(isNoteName(name), name).toBe(true);
  });

  it("refuses what is no file name or would break a link", () => {
    for (const name of ["", " ", ".hidden", "a/b", "a\\b", "a:b", "a*", "a?", 'a"', "a<", "a>", "a|b", "[a]", "a#b", "a^b", "a.", "a ", "a\nb"]) {
      expect(isNoteName(name), JSON.stringify(name)).toBe(false);
    }
  });

  it("refuses Windows' reserved names, as Rust does", () => {
    for (const name of ["NUL", "con", "COM1", "lpt9", "aux.notes"]) expect(isNoteName(name), name).toBe(false);
    expect(isNoteName("console")).toBe(true);
  });

  it("stops at 120 characters", () => {
    expect(isNoteName("a".repeat(120))).toBe(true);
    expect(isNoteName("a".repeat(121))).toBe(false);
  });
});
