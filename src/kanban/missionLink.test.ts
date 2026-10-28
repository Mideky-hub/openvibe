import { describe, expect, it } from "vitest";
import { readKanbanPayload, type KanbanPayload } from "@/nodes/types";
import { boardView, doneTarget, flagCard, inProgressColumn, setCardAgent, linkedTo, linkOrchestrator, planRequest, startCard, withInProgressColumn, type RequestTexts } from "./missionLink";

const ids = () => {
  let n = 0;
  return () => `new${++n}`;
};

function board(): KanbanPayload {
  return {
    columns: [
      { id: "todo", title: "À faire", cardIds: ["a", "b"] },
      { id: "done", title: "Fait", cardIds: [] },
    ],
    cards: {
      a: { id: "a", title: "Login", notes: "OAuth\nGitHub", priority: "high", due: "2026-11-02", github: { repo: "me/app", number: 12, url: "u", state: "open" } },
      b: { id: "b", title: "Logout", notes: "", priority: "none" },
    },
  };
}

const texts: RequestTexts = {
  request: (column, count, cards) => `PLAN ${column} (${count}): ${cards}`,
  priorities: { low: "low", medium: "medium", high: "high" },
  due: (date) => `due ${date}`,
  issue: (number, repo) => `#${number} ${repo}`,
};

describe("linkOrchestrator", () => {
  it("remembers the column and its orchestrator", () => {
    const linked = linkOrchestrator(board(), "orc", "todo");
    expect(linked.orchestrator).toEqual({ nodeId: "orc", columnId: "todo" });
    expect(linkedTo(linked, "orc")).toBe(true);
    expect(linkedTo(linked, "other")).toBe(false);
  });

  it("ignores an unknown column", () => {
    const b = board();
    expect(linkOrchestrator(b, "orc", "nope")).toBe(b);
  });

  it("survives a save, and a broken link is dropped", () => {
    const saved = JSON.parse(JSON.stringify(linkOrchestrator(board(), "orc", "todo")));
    expect(readKanbanPayload(saved).orchestrator).toEqual({ nodeId: "orc", columnId: "todo" });
    expect(readKanbanPayload({ ...saved, orchestrator: { nodeId: 3 } }).orchestrator).toBeUndefined();
    expect(readKanbanPayload({ ...saved, orchestrator: "orc" }).orchestrator).toBeUndefined();
  });

  it("reads a card's agent chip", () => {
    const raw = JSON.parse(JSON.stringify(board()));
    raw.cards.a.agent = "Amon";
    raw.cards.b.agent = 4;
    const read = readKanbanPayload(raw);
    expect(read.cards.a.agent).toBe("Amon");
    expect(read.cards.b.agent).toBeUndefined();
  });

  it("reads a chip's alert, never without an agent", () => {
    const raw = JSON.parse(JSON.stringify(board()));
    raw.cards.a = { ...raw.cards.a, agent: "Amon", agentStatus: "blocked" };
    raw.cards.b = { ...raw.cards.b, agentStatus: "failed" };
    const read = readKanbanPayload(raw);
    expect(read.cards.a.agentStatus).toBe("blocked");
    expect(read.cards.b.agentStatus).toBeUndefined();
    raw.cards.a.agentStatus = "weird";
    expect(readKanbanPayload(raw).cards.a.agentStatus).toBeUndefined();
  });
});

describe("planRequest", () => {
  it("lists the column's cards on one line, with their details", () => {
    const text = planRequest(board(), "todo", texts)!;
    expect(text).not.toMatch(/\n/);
    expect(text).toBe("PLAN À faire (2): 1) [a] Login — OAuth GitHub — high — due 2026-11-02 — #12 me/app | 2) [b] Logout");
  });

  it("cuts long notes", () => {
    const b = board();
    b.cards.b.notes = "x".repeat(1000);
    expect(planRequest(b, "todo", texts)!.length).toBeLessThan(500);
  });

  it("is null for an empty or unknown column", () => {
    expect(planRequest(board(), "done", texts)).toBeNull();
    expect(planRequest(board(), "nope", texts)).toBeNull();
  });
});

describe("startCard", () => {
  it("creates « En cours » before the done column and sets the agent chip", () => {
    const started = startCard(board(), "a", "Amon", "En cours", ids())!;
    expect(started.columnId).toBe("new1");
    expect(started.board.columns.map((c) => c.title)).toEqual(["À faire", "En cours", "Fait"]);
    expect(started.board.cards.a.agent).toBe("Amon");
    // The move is the caller's (GitHub follows it).
    expect(started.board.columns[0].cardIds).toContain("a");
  });

  it("reuses an existing in-progress column, whatever its case", () => {
    const b = board();
    b.columns.splice(1, 0, { id: "doing", title: "In Progress", cardIds: [] });
    expect(inProgressColumn(b)?.id).toBe("doing");
    expect(startCard(b, "a", "Amon", "En cours", ids())!.columnId).toBe("doing");
    expect(withInProgressColumn(b, "En cours").board).toBe(b);
  });

  it("is null for an unknown card", () => {
    expect(startCard(board(), "zzz", "Amon", "En cours")).toBeNull();
  });

  it("adds the column at the end of a board without columns", () => {
    const placed = withInProgressColumn({ columns: [], cards: {} }, "En cours", ids());
    expect(placed.board.columns).toEqual([{ id: "new1", title: "En cours", cardIds: [] }]);
  });
});

describe("the agent chip", () => {
  it("names the agent a sub-task went to, its alert cleared", () => {
    const flagged = flagCard(setCardAgent(board(), "a", "Amon"), "a", "failed");
    expect(flagged.cards.a).toMatchObject({ agent: "Amon", agentStatus: "failed" });
    const handed = setCardAgent(flagged, "a", "Thot");
    expect(handed.cards.a.agent).toBe("Thot");
    expect(handed.cards.a).not.toHaveProperty("agentStatus");
    expect(setCardAgent(board(), "zzz", "Thot").cards).toEqual(board().cards);
  });

  it("goes on alert for blocked or failed, the card staying in its column", () => {
    const started = startCard(board(), "a", "Amon", "En cours", ids())!.board;
    const blocked = flagCard(started, "a", "blocked");
    expect(blocked.cards.a.agentStatus).toBe("blocked");
    expect(blocked.columns).toBe(started.columns);
    expect(flagCard(blocked, "a", "blocked")).toBe(blocked);
    expect(flagCard(blocked, "a", "failed").cards.a.agentStatus).toBe("failed");
  });

  it("flags only a card with an agent", () => {
    const b = board();
    expect(flagCard(b, "a", "blocked")).toBe(b);
    expect(flagCard(b, "zzz", "blocked")).toBe(b);
  });

  it("is cleared when the card starts again", () => {
    const flagged = flagCard(setCardAgent(board(), "a", "Amon"), "a", "blocked");
    expect(startCard(flagged, "a", "Amon", "En cours", ids())!.board.cards.a).not.toHaveProperty("agentStatus");
  });
});

describe("doneTarget", () => {
  it("is the done column, until the card is in it", () => {
    const b = board();
    expect(doneTarget(b, "a")).toBe("done");
    b.columns[0].cardIds = ["b"];
    b.columns[1].cardIds = ["a"];
    expect(doneTarget(b, "a")).toBeNull();
    expect(doneTarget(b, "zzz")).toBeNull();
  });
});

describe("boardView", () => {
  it("gives columns and cards with their ids, the linked column marked", () => {
    const view = boardView("k1", linkOrchestrator(board(), "orc", "todo"));
    expect(view.board).toBe("k1");
    expect(view.columns[0]).toMatchObject({ id: "todo", linked: true });
    expect(view.columns[1].linked).toBe(false);
    expect(view.columns[0].cards[0]).toEqual({
      id: "a",
      title: "Login",
      notes: "OAuth\nGitHub",
      priority: "high",
      due: "2026-11-02",
      github: { repo: "me/app", number: 12, url: "u", state: "open" },
      agent: null,
      agent_status: null,
    });
    expect(view.columns[0].cards[1].github).toBeNull();
  });
});
