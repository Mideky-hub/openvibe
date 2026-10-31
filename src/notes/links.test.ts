import { describe, expect, it } from "vitest";
import { backlinks, edges, linksIn, noteNamed, type LinkedNote } from "./links";

const note = (name: string, text: string): LinkedNote => ({ name, text });

describe("wikilinks (spec notes §3)", () => {
  it("finds the plain and the labelled form, once each", () => {
    expect(linksIn("See [[Auth]] and [[Deploy|the deploy]], and [[Auth]] again.")).toEqual([
      { target: "Auth", label: "Auth" },
      { target: "Deploy", label: "the deploy" },
      { target: "Auth", label: "Auth" },
    ]);
  });

  it("trims what is inside the brackets", () => {
    expect(linksIn("[[ Auth | login ]]")).toEqual([{ target: "Auth", label: "login" }]);
  });

  it("ignores links in code", () => {
    expect(linksIn("`[[a]]`\n```\n[[b]]\n```\n[[c]]")).toEqual([{ target: "c", label: "c" }]);
  });

  it("ignores empty or broken brackets", () => {
    expect(linksIn("[[]] [[ ]] [[a] [b]] [[a/b]]")).toEqual([]);
  });

  it("resolves a name whatever its case", () => {
    const notes = [note("Auth", ""), note("deploy", "")];
    expect(noteNamed(notes, "auth")?.name).toBe("Auth");
    expect(noteNamed(notes, "DEPLOY")?.name).toBe("deploy");
    expect(noteNamed(notes, "none")).toBeNull();
  });
});

describe("what links to what", () => {
  const notes = [note("a", "[[B]] [[b]] [[ghost]]"), note("b", "[[a]] [[b]]"), note("c", "plain")];

  it("lists the notes that link to a note, whatever the case, without itself", () => {
    expect(backlinks(notes, "b").map((n) => n.name)).toEqual(["a"]);
    expect(backlinks(notes, "A").map((n) => n.name)).toEqual(["b"]);
    expect(backlinks(notes, "c")).toEqual([]);
  });

  it("counts each link between two notes once, and ignores absent notes and self-links", () => {
    expect(edges(notes)).toEqual([{ from: "a", to: "b" }]);
  });
});
