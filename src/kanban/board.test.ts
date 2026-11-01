import { describe, expect, it } from "vitest";
import { readKanbanPayload } from "@/nodes/types";
import {
  addCard,
  addColumn,
  cardText,
  columnOf,
  dueOf,
  dueState,
  emptyBoard,
  moveCard,
  removeCard,
  removeColumn,
  renameColumn,
  updateCard,
} from "./board";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const draft = (title: string) => ({ title, notes: "", priority: "none" as const });

function board() {
  const newId = ids();
  let b = emptyBoard(["To do", "Doing", "Done"], newId);
  b = addCard(b, "id1", draft("a"), newId);
  b = addCard(b, "id1", draft("b"), newId);
  b = addCard(b, "id2", draft("c"), newId);
  return b;
}

describe("board", () => {
  it("starts with its columns and no card", () => {
    expect(emptyBoard(["A", "B"], ids())).toEqual({
      columns: [
        { id: "id1", title: "A", cardIds: [] },
        { id: "id2", title: "B", cardIds: [] },
      ],
      cards: {},
    });
  });

  it("adds, renames and removes columns with their cards", () => {
    let b = addColumn(board(), "Later", () => "x");
    expect(b.columns.map((c) => c.title)).toEqual(["To do", "Doing", "Done", "Later"]);
    b = renameColumn(b, "x", "Someday");
    expect(b.columns[3].title).toBe("Someday");
    b = removeColumn(b, "id1");
    expect(b.columns.map((c) => c.id)).toEqual(["id2", "id3", "x"]);
    expect(Object.keys(b.cards)).toEqual(["id6"]);
  });

  it("adds a card at the end of a column, not to an unknown one", () => {
    const b = board();
    expect(b.columns[0].cardIds).toEqual(["id4", "id5"]);
    expect(b.cards.id4).toEqual({ id: "id4", title: "a", notes: "", priority: "none" });
    expect(addCard(b, "nope", draft("z"))).toBe(b);
  });

  it("keeps a due date only when set", () => {
    const b = addCard(emptyBoard(["A"], () => "c"), "c", { ...draft("x"), due: "2026-01-02" }, () => "k");
    expect(b.cards.k.due).toBe("2026-01-02");
    expect(updateCard(b, "k", { due: undefined }).cards.k).not.toHaveProperty("due");
  });

  it("updates and removes cards", () => {
    let b = updateCard(board(), "id4", { title: "A", priority: "high" });
    expect(b.cards.id4).toMatchObject({ title: "A", priority: "high" });
    b = removeCard(b, "id4");
    expect(b.cards.id4).toBeUndefined();
    expect(b.columns[0].cardIds).toEqual(["id5"]);
  });

  it("moves a card between columns and within one", () => {
    const b = board();
    const moved = moveCard(b, "id4", "id2", 0);
    expect(moved.columns[0].cardIds).toEqual(["id5"]);
    expect(moved.columns[1].cardIds).toEqual(["id4", "id6"]);
    expect(columnOf(moved, "id4")?.id).toBe("id2");
    expect(moveCard(b, "id4", "id1").columns[0].cardIds).toEqual(["id5", "id4"]);
    expect(moveCard(b, "id5", "id1", 0).columns[0].cardIds).toEqual(["id5", "id4"]);
    expect(moveCard(b, "id4", "id3", 99).columns[2].cardIds).toEqual(["id4"]);
    expect(moveCard(b, "nope", "id2")).toBe(b);
    expect(moveCard(b, "id4", "nope")).toBe(b);
  });

  it("gives a card's text as its title then its notes", () => {
    expect(cardText({ title: " Fix login ", notes: "" })).toBe("Fix login");
    expect(cardText({ title: "Fix login", notes: "On Safari\n" })).toBe("Fix login\n\nOn Safari");
  });

  it("dates presets from today", () => {
    const now = new Date(2026, 11, 31, 15);
    expect(dueOf("today", now)).toBe("2026-12-31");
    expect(dueOf("tomorrow", now)).toBe("2027-01-01");
    expect(dueOf("nextWeek", now)).toBe("2027-01-07");
    expect(dueState("2026-12-30", now)).toBe("overdue");
    expect(dueState("2026-12-31", now)).toBe("today");
    expect(dueState("2027-01-01", now)).toBe("later");
  });
});

describe("readKanbanPayload", () => {
  it("reads nothing as an empty board", () => {
    expect(readKanbanPayload(null)).toEqual({ columns: [], cards: {} });
    expect(readKanbanPayload({ columns: "x", cards: 3 })).toEqual({ columns: [], cards: {} });
  });

  it("keeps a valid board as it is, GitHub link included", () => {
    const github = { repo: "o/r", number: 29, url: "https://github.com/o/r/issues/29", state: "open" as const };
    const b = {
      columns: [{ id: "c1", title: "To do", cardIds: ["k1"] }],
      cards: { k1: { id: "k1", title: "t", notes: "n", due: "2026-10-28", priority: "high" as const, github } },
    };
    expect(readKanbanPayload(JSON.parse(JSON.stringify(b)))).toEqual(b);
  });

  it("drops what it cannot read", () => {
    expect(
      readKanbanPayload({
        columns: [
          { id: "c1", title: 4, cardIds: ["k1", "k1", "ghost", 7] },
          { id: "c1", title: "dup", cardIds: [] },
          { title: "no id" },
          { id: "c2", title: "B", cardIds: ["k1", "k2"] },
        ],
        cards: {
          k1: { title: "t", priority: "urgent", due: "tomorrow", github: { repo: "o/r", number: "1" } },
          k2: { title: "u", notes: "n", priority: "low" },
          orphan: { title: "o" },
        },
      }),
    ).toEqual({
      columns: [
        { id: "c1", title: "", cardIds: ["k1"] },
        { id: "c2", title: "B", cardIds: ["k2"] },
      ],
      cards: { k1: { id: "k1", title: "t", notes: "", priority: "none" }, k2: { id: "k2", title: "u", notes: "n", priority: "low" } },
    });
  });
});

describe("readKanbanPayload's GitHub link", () => {
  it("keeps a valid link and its project, drops a bad one", () => {
    const base = { columns: [], cards: {} };
    expect(readKanbanPayload({ ...base, github: { repo: "o/r", project: { owner: "o", number: 2 } } }).github).toEqual({
      repo: "o/r",
      project: { owner: "o", number: 2 },
    });
    expect(readKanbanPayload({ ...base, github: { repo: "o/r", project: { owner: "o", number: "2" } } }).github).toEqual({ repo: "o/r" });
    expect(readKanbanPayload({ ...base, github: { repo: "not a repo" } })).not.toHaveProperty("github");
  });
});
