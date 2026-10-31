import { describe, expect, it } from "vitest";
import { searchNotes } from "./search";

const notes = [
  { name: "Auth", text: "Login with tokens.\nRefresh every hour." },
  { name: "Deploy", text: "Build, then auth check." },
  { name: "Évité", text: "Rien ici" },
];

describe("searching the notes (spec notes §2)", () => {
  it("gives every note for an empty search", () => {
    expect(searchNotes(notes, "  ").map((hit) => hit.name)).toEqual(["Auth", "Deploy", "Évité"]);
  });

  it("puts a match in the name first", () => {
    expect(searchNotes(notes, "auth").map((hit) => hit.name)).toEqual(["Auth", "Deploy"]);
  });

  it("ignores case and accents", () => {
    expect(searchNotes(notes, "EVITE").map((hit) => hit.name)).toEqual(["Évité"]);
  });

  it("shows the line that matched", () => {
    expect(searchNotes(notes, "refresh")[0].excerpt).toBe("Refresh every hour.");
  });

  it("needs every word", () => {
    expect(searchNotes(notes, "build auth").map((hit) => hit.name)).toEqual(["Deploy"]);
    expect(searchNotes(notes, "build tokens")).toEqual([]);
  });
});
