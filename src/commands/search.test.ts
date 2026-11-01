import { describe, expect, it } from "vitest";
import { matchScore, normalize, rank, rankSections } from "./search";

describe("normalize", () => {
  it("drops case and accents", () => {
    expect(normalize("Hermès ÉCOLE")).toBe("hermes ecole");
  });
});

describe("matchScore (spec fenêtre §7.1)", () => {
  it("finds regardless of case and accents, with letters in order, not necessarily together", () => {
    expect(matchScore("hermes", "Hermès")).not.toBeNull();
    expect(matchScore("ISIS", "Isis")).not.toBeNull();
    expect(matchScore("hrms", "Hermès")).not.toBeNull();
    expect(matchScore("smreh", "Hermès")).toBeNull();
  });

  it("reads the keywords too, every term having to match", () => {
    expect(matchScore("isis cl", "Isis", ["Claude", "Backend", "Workspace 1"])).not.toBeNull();
    expect(matchScore("isis co", "Isis", ["Claude"])).toBeNull();
  });

  it("puts a word start before a match inside a word, and the label before the keywords", () => {
    expect(matchScore("th", "Thot")!).toBeGreaterThan(matchScore("th", "Arthur")!);
    expect(matchScore("ba", "Bastet", ["Claude"])!).toBeGreaterThan(matchScore("ba", "Isis", ["Backend"])!);
  });
});

describe("rank", () => {
  const items = [
    { label: "Arthur", keywords: [] },
    { label: "Thot", keywords: [] },
    { label: "Isis", keywords: ["Claude"] },
  ];
  const textOf = (item: { label: string; keywords: string[] }) => item;

  it("keeps every item in its order without a search", () => {
    expect(rank(items, "  ", textOf)).toEqual(items);
  });

  it("keeps the matches only, best first, ties in their order", () => {
    expect(rank(items, "th", textOf).map((i) => i.label)).toEqual(["Thot", "Arthur"]);
    expect(rank(items, "zz", textOf)).toEqual([]);
  });

  it("breaks a tie by the share of the label the search covers", () => {
    const tied = [
      { label: "Renommer le workspace", keywords: [] },
      { label: "Renommer", keywords: [] },
      { label: "Tout mettre en pause", keywords: [] },
      { label: "Mettre en pause", keywords: [] },
    ];
    expect(rank(tied, "renommer", textOf).map((i) => i.label)).toEqual(["Renommer", "Renommer le workspace"]);
    expect(rank(tied, "pause", textOf).map((i) => i.label)).toEqual(["Mettre en pause", "Tout mettre en pause"]);
  });
});

describe("rankSections", () => {
  const textOf = (item: { label: string; keywords: string[] }) => item;
  const sections = [
    { label: "Navigation", items: [{ label: "Masquer le panneau Agents", keywords: [] }] },
    { label: "Agents", items: [{ label: "Tout mettre en pause", keywords: [] }] },
    { label: "Terminal · Isis", items: [{ label: "Mettre en pause", keywords: [] }] },
  ];

  it("puts the section of the best match first while searching: its first line is the one chosen", () => {
    expect(rankSections(sections, "pause", textOf).map((s) => s.label)).toEqual(["Terminal · Isis", "Agents", "Navigation"]);
  });

  it("keeps the sections in their order without a search", () => {
    expect(rankSections(sections, " ", textOf).map((s) => s.label)).toEqual(["Navigation", "Agents", "Terminal · Isis"]);
  });
});

describe("search details (plan F1 findings)", () => {
  it("puts the exact word before a longer word starting with the term", () => {
    expect(matchScore("tho", "Tho")!).toBeGreaterThan(matchScore("tho", "Thor")!);
    const items = [{ label: "Thor", keywords: [] }, { label: "Tho", keywords: [] }];
    expect(rank(items, "tho", (i) => i).map((i) => i.label)).toEqual(["Tho", "Thor"]);
  });

  it("splits words at apostrophes", () => {
    expect(matchScore("ensemble", "Vue d'ensemble")).toBe(matchScore("ensemble", "Vue ensemble"));
    expect(matchScore("ensemble", "Vue d’ensemble")!).toBeGreaterThanOrEqual(4);
  });

  it("unfolds the ligatures œ and æ", () => {
    expect(normalize("Cœur Æon")).toBe("coeur aeon");
    expect(matchScore("coeur", "Cœur")).not.toBeNull();
  });
});
