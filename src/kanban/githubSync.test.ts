import { describe, expect, it } from "vitest";
import type { GithubIssue, GithubProjectItem } from "../ipc/github";
import {
  doneColumn,
  githubKey,
  issueToCard,
  mergeGithub,
  projectItemToCard,
  remoteActionsForMove,
  type Board,
  type Card,
} from "./githubSync";

const REPO = "Owner/Repo";

const issue = (number: number, extra: Partial<GithubIssue> = {}): GithubIssue => ({
  number,
  title: `Issue ${number}`,
  body: `body ${number}`,
  state: "open",
  url: `https://github.com/Owner/Repo/issues/${number}`,
  closedAt: null,
  labels: [],
  ...extra,
});

const item = (number: number | null, status: string | null, extra: Partial<GithubProjectItem["content"]> = {}): GithubProjectItem => ({
  id: `PVTI_${number}`,
  title: `Item ${number}`,
  status,
  content: { kind: "issue", repo: REPO, number, url: `https://github.com/Owner/Repo/issues/${number}`, body: `item body ${number}`, ...extra },
});

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

const board = (columns: [string, string[]][], cards: Card[] = []): Board => ({
  columns: columns.map(([title, cardIds]) => ({ id: title.toLowerCase().replace(/\s/g, "-"), title, cardIds })),
  cards: Object.fromEntries(cards.map((c) => [c.id, c])),
});

const linkedCard = (id: string, number: number, state: "open" | "closed" = "open", extra: Partial<Card> = {}): Card => ({
  id,
  title: `Old ${number}`,
  notes: "local notes",
  priority: "high",
  due: "2026-11-01",
  github: { repo: REPO, number, url: "old-url", state },
  ...extra,
});

const columnTitles = (b: Board) => b.columns.map((c) => c.title);
const cardsIn = (b: Board, title: string) => b.columns.find((c) => c.title === title)?.cardIds;

describe("githubKey", () => {
  it("formats owner/name#number", () => {
    expect(githubKey("owner/name", 12)).toBe("owner/name#12");
  });

  it("ignores repo case and surrounding spaces", () => {
    expect(githubKey(" Owner/Name ", 12)).toBe(githubKey("owner/name", 12));
  });
});

describe("issueToCard", () => {
  it("links the card to the issue with body as notes", () => {
    expect(issueToCard(issue(4, { state: "closed" }), REPO, "c1")).toEqual({
      id: "c1",
      title: "Issue 4",
      notes: "body 4",
      priority: "none",
      github: { repo: REPO, number: 4, url: "https://github.com/Owner/Repo/issues/4", state: "closed" },
    });
  });
});

describe("projectItemToCard", () => {
  it("converts an issue item", () => {
    expect(projectItemToCard(item(5, "Todo"), "c1")).toMatchObject({
      id: "c1",
      title: "Item 5",
      notes: "item body 5",
      github: { repo: REPO, number: 5, state: "open" },
    });
  });

  it("keeps the given state", () => {
    expect(projectItemToCard(item(5, null), "c1", "closed")?.github?.state).toBe("closed");
  });

  it("skips drafts and items without repo or number", () => {
    expect(projectItemToCard(item(null, "Todo", { kind: "draft", repo: null, url: null }), "c1")).toBeNull();
    expect(projectItemToCard(item(5, "Todo", { kind: "draft" }), "c1")).toBeNull();
    expect(projectItemToCard(item(null, "Todo"), "c1")).toBeNull();
    expect(projectItemToCard(item(5, "Todo", { repo: null }), "c1")).toBeNull();
  });

  it("converts pull requests", () => {
    expect(projectItemToCard(item(6, null, { kind: "pullRequest" }), "c1")?.github?.number).toBe(6);
  });
});

describe("doneColumn", () => {
  it("prefers a done-like title", () => {
    expect(doneColumn(board([["À faire", []], ["Terminé", []], ["Archive", []]]))?.title).toBe("Terminé");
    expect(doneColumn(board([["Todo", []], [" DONE ", []], ["Later", []]]))?.title).toBe(" DONE ");
    expect(doneColumn(board([["Todo", []], ["Fait", []], ["Later", []]]))?.title).toBe("Fait");
  });

  it("falls back to the last column", () => {
    expect(doneColumn(board([["A", []], ["B", []]]))?.title).toBe("B");
  });

  it("is undefined on an empty board", () => {
    expect(doneColumn(board([]))).toBeUndefined();
  });
});

describe("mergeGithub by issue state", () => {
  it("puts new open issues in the first column and closed ones in the done column", () => {
    const start = board([["Todo", ["x"]], ["Done", []], ["Archive", []]], [{ id: "x", title: "local", notes: "", priority: "none" }]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1), issue(2, { state: "closed" })], newId: ids() });

    expect(result.columns.map((c) => c.cardIds)).toEqual([["x", "id1"], ["id2"], []]);
    expect(result.cards.id1).toMatchObject({ title: "Issue 1", notes: "body 1", priority: "none", github: { number: 1, state: "open" } });
    expect(result.cards.id2.github?.state).toBe("closed");
  });

  it("uses the last column for closed issues without a done-like column", () => {
    const result = mergeGithub(board([["A", []], ["B", []]]), { repo: REPO, issues: [issue(1, { state: "closed" })], newId: ids() });
    expect(cardsIn(result, "B")).toEqual(["id1"]);
  });

  it("creates default columns on an empty board", () => {
    const result = mergeGithub(board([]), { repo: REPO, issues: [issue(1), issue(2, { state: "closed" })], newId: ids() });
    expect(columnTitles(result)).toEqual(["To do", "In progress", "Done"]);
    expect(result.columns.map((c) => c.cardIds)).toEqual([["id1"], [], ["id5"]]);
  });

  it("leaves an empty board untouched when there is nothing to merge", () => {
    expect(mergeGithub(board([]), { repo: REPO, issues: [], newId: ids() })).toEqual(board([]));
  });

  it("does not mutate the input board", () => {
    const start = board([["Todo", ["a"]], ["Done", []]], [linkedCard("a", 1)]);
    const snapshot = structuredClone(start);
    mergeGithub(start, { repo: REPO, issues: [issue(1, { state: "closed" }), issue(2)], newId: ids() });
    expect(start).toEqual(snapshot);
  });

  it("updates linked cards in place, keeping local fields and column", () => {
    const start = board([["Todo", []], ["Doing", ["a"]], ["Done", []]], [linkedCard("a", 1)]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1, { title: "Renamed" })], newId: ids() });

    expect(Object.keys(result.cards)).toEqual(["a"]);
    expect(result.cards.a).toEqual({
      id: "a",
      title: "Renamed",
      notes: "local notes",
      priority: "high",
      due: "2026-11-01",
      github: { repo: REPO, number: 1, url: "https://github.com/Owner/Repo/issues/1", state: "open" },
    });
    expect(cardsIn(result, "Doing")).toEqual(["a"]);
  });

  it("matches linked cards case-insensitively on the repo", () => {
    const start = board([["Todo", ["a"]]], [linkedCard("a", 1, "open", { github: { repo: "owner/repo", number: 1, url: "", state: "open" } })]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1)], newId: ids() });
    expect(Object.keys(result.cards)).toEqual(["a"]);
  });

  it("does not match an issue with the same number from another repo", () => {
    const start = board([["Todo", ["a"]]], [linkedCard("a", 1, "open", { github: { repo: "other/repo", number: 1, url: "", state: "open" } })]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1)], newId: ids() });
    expect(Object.keys(result.cards)).toEqual(["a", "id1"]);
  });

  it("is idempotent", () => {
    const options = { repo: REPO, issues: [issue(1), issue(2, { state: "closed" })], newId: ids() };
    const once = mergeGithub(board([["Todo", []], ["Done", []]]), options);
    expect(mergeGithub(once, options)).toEqual(once);
  });

  it("moves a card to done when its issue gets closed", () => {
    const start = board([["Todo", []], ["Doing", ["a"]], ["Done", []]], [linkedCard("a", 1)]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1, { state: "closed" })], newId: ids() });
    expect(cardsIn(result, "Doing")).toEqual([]);
    expect(cardsIn(result, "Done")).toEqual(["a"]);
    expect(result.cards.a.github?.state).toBe("closed");
  });

  it("moves a card to the first column when its issue gets reopened", () => {
    const start = board([["Todo", ["b"]], ["Done", ["a"]]], [linkedCard("a", 1, "closed"), linkedCard("b", 2)]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1), issue(2)], newId: ids() });
    expect(cardsIn(result, "Todo")).toEqual(["b", "a"]);
    expect(cardsIn(result, "Done")).toEqual([]);
  });

  it("keeps a closed card wherever the user put it while it stays closed", () => {
    const start = board([["Todo", []], ["Archive", ["a"]], ["Done", []]], [linkedCard("a", 1, "closed")]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1, { state: "closed" })], newId: ids() });
    expect(cardsIn(result, "Archive")).toEqual(["a"]);
  });

  it("places a linked card that lost its column", () => {
    const start = board([["Todo", []], ["Done", []]], [linkedCard("a", 1)]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1)], newId: ids() });
    expect(cardsIn(result, "Todo")).toEqual(["a"]);
  });

  it("leaves cards whose issue is no longer listed", () => {
    const start = board([["Todo", ["a"]], ["Done", []]], [linkedCard("a", 1)]);
    expect(mergeGithub(start, { repo: REPO, issues: [], newId: ids() })).toEqual(start);
  });

  it("does not duplicate an issue listed twice", () => {
    const result = mergeGithub(board([["Todo", []]]), { repo: REPO, issues: [issue(1), issue(1)], newId: ids() });
    expect(Object.keys(result.cards)).toHaveLength(1);
    expect(cardsIn(result, "Todo")).toHaveLength(1);
  });
});

describe("mergeGithub with project items", () => {
  it("places items by Status, matching column titles case-insensitively", () => {
    const start = board([["Todo", []], ["In Progress", []], ["Done", []]]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1), issue(2)], projectItems: [item(1, " in progress "), item(2, "TODO")], newId: ids() });
    expect(cardsIn(result, "In Progress")).toEqual(["id1"]);
    expect(cardsIn(result, "Todo")).toEqual(["id2"]);
  });

  it("creates a missing Status column once, at the end", () => {
    const result = mergeGithub(board([["Todo", []]]), {
      repo: REPO,
      issues: [],
      projectItems: [item(1, "Review"), item(2, "Review")],
      newId: ids(),
    });
    expect(columnTitles(result)).toEqual(["Todo", "Review"]);
    expect(cardsIn(result, "Review")).toEqual(["id1", "id3"]);
  });

  it("takes title and state from the matching issue, Status from the item", () => {
    const result = mergeGithub(board([["Todo", []], ["Done", []]]), {
      repo: REPO,
      issues: [issue(1, { state: "closed", title: "From issue" })],
      projectItems: [item(1, "Todo")],
      newId: ids(),
    });
    expect(Object.keys(result.cards)).toEqual(["id1"]);
    expect(result.cards.id1).toMatchObject({ title: "From issue", notes: "body 1", github: { state: "closed" } });
    expect(cardsIn(result, "Todo")).toEqual(["id1"]);
  });

  it("falls back to issue state for items without Status", () => {
    const result = mergeGithub(board([["Todo", []], ["Done", []]]), {
      repo: REPO,
      issues: [issue(1, { state: "closed" })],
      projectItems: [item(1, null), item(2, "  ")],
      newId: ids(),
    });
    expect(cardsIn(result, "Done")).toEqual(["id1"]);
    expect(cardsIn(result, "Todo")).toEqual(["id2"]);
  });

  it("adds items from other repos and skips drafts", () => {
    const result = mergeGithub(board([["Todo", []]]), {
      repo: REPO,
      issues: [],
      projectItems: [item(7, "Todo", { repo: "other/lib" }), item(null, "Todo", { kind: "draft", repo: null })],
      newId: ids(),
    });
    expect(Object.values(result.cards).map((c) => c.github)).toEqual([
      { repo: "other/lib", number: 7, url: "https://github.com/Owner/Repo/issues/7", state: "open" },
    ]);
  });

  it("moves a linked card when its Status changed", () => {
    const start = board([["Todo", ["a"]], ["Doing", []], ["Done", []]], [linkedCard("a", 1)]);
    const result = mergeGithub(start, { repo: REPO, issues: [issue(1)], projectItems: [item(1, "Doing")], newId: ids() });
    expect(cardsIn(result, "Todo")).toEqual([]);
    expect(cardsIn(result, "Doing")).toEqual(["a"]);
  });

  it("keeps a linked card whose column already matches its Status", () => {
    const start = board([["Todo", []], ["Doing", ["b", "a"]]], [linkedCard("a", 1), linkedCard("b", 2)]);
    const result = mergeGithub(start, { repo: REPO, issues: [], projectItems: [item(1, "doing"), item(2, "Doing")], newId: ids() });
    expect(cardsIn(result, "Doing")).toEqual(["b", "a"]);
  });

  it("leaves a card parked in a non-Status column when the statuses are known", () => {
    const start = board([["Todo", []], ["Ideas", ["a"]], ["Doing", []]], [linkedCard("a", 1)]);
    const options = { repo: REPO, issues: [issue(1)], projectItems: [item(1, "Doing")], newId: ids() };
    expect(cardsIn(mergeGithub(start, { ...options, projectStatuses: ["Todo", "Doing"] }), "Ideas")).toEqual(["a"]);
    expect(cardsIn(mergeGithub(start, options), "Doing")).toEqual(["a"]);
  });

  it("keeps the known state of a card whose issue is missing from the list", () => {
    const start = board([["Todo", []], ["Done", ["a"]]], [linkedCard("a", 1, "closed")]);
    const result = mergeGithub(start, { repo: REPO, issues: [], projectItems: [item(1, "Done")], newId: ids() });
    expect(result.cards.a.github?.state).toBe("closed");
    expect(cardsIn(result, "Done")).toEqual(["a"]);
  });

  it("is idempotent", () => {
    const options = { repo: REPO, issues: [issue(1)], projectItems: [item(1, "Review"), item(2, null)], newId: ids() };
    const once = mergeGithub(board([["Todo", []]]), options);
    expect(mergeGithub(once, options)).toEqual(once);
  });
});

describe("remoteActionsForMove", () => {
  const start = () =>
    board(
      [
        ["Todo", ["a", "local"]],
        ["Doing", ["b"]],
        ["Done", ["c"]],
      ],
      [linkedCard("a", 1), linkedCard("b", 2), linkedCard("c", 3, "closed"), { id: "local", title: "x", notes: "", priority: "none" }],
    );
  const project = {
    projectStatuses: ["Todo", "In progress", "Done"],
    projectItemIdByKey: { [githubKey("owner/repo", 1)]: "PVTI_1", [githubKey(REPO, 3)]: "PVTI_3" },
  };

  it("returns nothing for unlinked cards, unknown cards or columns, and same-column moves", () => {
    expect(remoteActionsForMove(start(), "local", "done", project)).toEqual([]);
    expect(remoteActionsForMove(start(), "missing", "done", project)).toEqual([]);
    expect(remoteActionsForMove(start(), "a", "nowhere", project)).toEqual([]);
    expect(remoteActionsForMove(start(), "a", "todo", project)).toEqual([]);
  });

  it("closes an open issue moved into the done column", () => {
    expect(remoteActionsForMove(start(), "b", "done")).toEqual([{ type: "setIssueState", repo: REPO, number: 2, state: "closed" }]);
  });

  it("reopens a closed issue moved out of the done column", () => {
    expect(remoteActionsForMove(start(), "c", "doing")).toEqual([{ type: "setIssueState", repo: REPO, number: 3, state: "open" }]);
  });

  it("uses the last column as done column when none is named so", () => {
    const b = board([["A", ["a"]], ["B", []]], [linkedCard("a", 1)]);
    expect(remoteActionsForMove(b, "a", "b")).toEqual([{ type: "setIssueState", repo: REPO, number: 1, state: "closed" }]);
  });

  it("does nothing between non-done columns", () => {
    expect(remoteActionsForMove(start(), "b", "todo")).toEqual([]);
  });

  it("does not close an already closed issue", () => {
    const b = start();
    b.cards.b = linkedCard("b", 2, "closed");
    expect(remoteActionsForMove(b, "b", "done")).toEqual([]);
  });

  it("moves the project item when the target column is a Status option", () => {
    expect(remoteActionsForMove(start(), "a", "done", project)).toEqual([
      { type: "moveProjectItem", itemId: "PVTI_1", status: "Done" },
      { type: "setIssueState", repo: REPO, number: 1, state: "closed" },
    ]);
    expect(remoteActionsForMove(start(), "c", "todo", project)).toEqual([
      { type: "moveProjectItem", itemId: "PVTI_3", status: "Todo" },
      { type: "setIssueState", repo: REPO, number: 3, state: "open" },
    ]);
  });

  it("matches Status options case-insensitively and sends the exact option name", () => {
    const b = board([["todo ", ["a"]], ["IN PROGRESS", []]], [linkedCard("a", 1)]);
    expect(remoteActionsForMove(b, "a", "in-progress", project)).toEqual([
      { type: "moveProjectItem", itemId: "PVTI_1", status: "In progress" },
      { type: "setIssueState", repo: REPO, number: 1, state: "closed" },
    ]);
  });

  it("skips the project move for cards outside the project or columns without a Status", () => {
    expect(remoteActionsForMove(start(), "b", "done", project)).toEqual([{ type: "setIssueState", repo: REPO, number: 2, state: "closed" }]);
    expect(remoteActionsForMove(start(), "a", "doing", project)).toEqual([]);
    expect(remoteActionsForMove(start(), "a", "done", { projectItemIdByKey: project.projectItemIdByKey })).toEqual([
      { type: "setIssueState", repo: REPO, number: 1, state: "closed" },
    ]);
  });
});
