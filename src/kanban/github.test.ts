// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { KanbanPayload } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { projectsStore } from "@/store/projects";
import { createIssueForCard, linkBoard, moveCardWithGithub, parseProject, syncBoard } from "./github";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

type Handler = (args: Record<string, unknown>) => unknown;
let calls: [string, Record<string, unknown>][] = [];

/** IPC with GitHub commands answered by `handlers`; saves succeed. */
function mockGithub(handlers: Record<string, Handler>) {
  calls = [];
  mockIPC((cmd, args) => {
    const payload = (args ?? {}) as Record<string, unknown>;
    if (cmd.startsWith("github_")) calls.push([cmd, payload]);
    return handlers[cmd]?.(payload);
  });
}

const issue = (number: number, state: "open" | "closed", title = `Issue ${number}`) => ({
  number,
  title,
  body: "",
  state,
  url: `https://github.com/o/r/issues/${number}`,
  closedAt: null,
  labels: [],
});

const item = (id: string, number: number, status: string | null) => ({
  id,
  title: `Issue ${number}`,
  status,
  content: { kind: "issue", repo: "o/r", number, url: `https://github.com/o/r/issues/${number}`, body: "" },
});

function board(): KanbanPayload {
  const record = nodesStore.getState().nodes.b;
  if (record?.kind !== "kanban") throw new Error("not a kanban");
  return record.payload;
}

const linked = (number: number, state: "open" | "closed") => ({ repo: "o/r", number, url: `https://github.com/o/r/issues/${number}`, state });

beforeEach(async () => {
  toast.success.mockClear();
  toast.error.mockClear();
  mockGithub({});
  projectsStore.setState({ projects: [{ id: "p", name: "r", path: "C:/r", position: 0, lastOpenedAt: 0, workspaceCount: 1, missing: false, liveAgents: 0 }], activeId: "p" });
  await nodesStore.getState().create("b", {
    workspaceId: "w1",
    kind: "kanban",
    payload: {
      columns: [
        { id: "todo", title: "To do", cardIds: ["k1", "k2"] },
        { id: "doing", title: "In progress", cardIds: [] },
        { id: "done", title: "Done", cardIds: [] },
      ],
      cards: {
        k1: { id: "k1", title: "Issue 1", notes: "", priority: "none", github: linked(1, "open") },
        k2: { id: "k2", title: "Local", notes: "keep", priority: "high" },
      },
      github: { repo: "o/r", project: { owner: "o", number: 2 } },
    },
  });
  // Linking again forgets what an earlier test learnt about the Project.
  linkBoard("b", { repo: "o/r", project: { owner: "o", number: 2 } });
});

afterEach(() => clearMocks());

describe("parseProject", () => {
  it("reads owner/number and Project URLs", () => {
    expect(parseProject("o/2")).toEqual({ owner: "o", number: 2 });
    expect(parseProject("https://github.com/orgs/acme/projects/7/views/1")).toEqual({ owner: "acme", number: 7 });
    expect(parseProject("https://github.com/users/me/projects/3")).toEqual({ owner: "me", number: 3 });
    expect(parseProject("acme")).toBeNull();
    expect(parseProject("o/0")).toBeNull();
  });
});

describe("linkBoard", () => {
  it("remembers the link and forgets it on unlink", () => {
    linkBoard("b", { repo: "x/y" });
    expect(board().github).toEqual({ repo: "x/y" });
    linkBoard("b", null);
    expect(board().github).toBeUndefined();
    expect(board().cards.k2.notes).toBe("keep");
  });
});

describe("syncBoard", () => {
  it("merges the issues and the Project's Status into the board", async () => {
    mockGithub({
      github_list_issues: () => [issue(1, "open"), issue(5, "closed", "Shipped")],
      github_list_project_items: () => [item("PVTI_1", 1, "In progress")],
      github_project_statuses: () => ["To do", "In progress", "Done"],
    });
    expect(await syncBoard("b")).toBe(true);
    expect(calls.map(([cmd]) => cmd).sort()).toEqual(["github_list_issues", "github_list_project_items", "github_project_statuses"]);
    expect(calls.find(([cmd]) => cmd === "github_list_issues")![1]).toMatchObject({ path: "C:/r", repo: "o/r" });
    const b = board();
    expect(b.columns.find((c) => c.id === "doing")!.cardIds).toEqual(["k1"]);
    const shipped = Object.values(b.cards).find((c) => c.title === "Shipped")!;
    expect(b.columns.find((c) => c.id === "done")!.cardIds).toEqual([shipped.id]);
    expect(b.github).toEqual({ repo: "o/r", project: { owner: "o", number: 2 } });
    expect(toast.success).toHaveBeenCalled();
  });

  it("tells a gh failure and leaves the board as it was", async () => {
    mockGithub({
      github_list_issues: () => {
        throw { kind: "github", message: "GitHub CLI (gh) not found: install it" };
      },
    });
    const before = board();
    expect(await syncBoard("b")).toBe(false);
    expect(board()).toBe(before);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("GitHub CLI (gh) not found"));
  });
});

describe("moveCardWithGithub", () => {
  it("closes the issue and moves its Project item when a linked card enters Done", async () => {
    mockGithub({
      github_list_project_items: () => [item("PVTI_1", 1, "To do")],
      github_project_statuses: () => ["To do", "In progress", "Done"],
    });
    await moveCardWithGithub("b", "k1", "done");
    expect(calls).toContainEqual(["github_move_project_item", { path: "C:/r", owner: "o", projectNumber: 2, itemId: "PVTI_1", status: "Done" }]);
    expect(calls).toContainEqual(["github_set_issue_state", { path: "C:/r", repo: "o/r", number: 1, state: "closed" }]);
    expect(board().columns.find((c) => c.id === "done")!.cardIds).toEqual(["k1"]);
    expect(board().cards.k1.github!.state).toBe("closed");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the card moved and says why when GitHub refuses", async () => {
    mockGithub({
      github_list_project_items: () => [],
      github_project_statuses: () => ["To do", "Done"],
      github_set_issue_state: () => {
        throw { kind: "github", message: "GitHub CLI not authenticated: run `gh auth login` in a terminal." };
      },
    });
    await moveCardWithGithub("b", "k1", "done");
    expect(board().columns.find((c) => c.id === "done")!.cardIds).toEqual(["k1"]);
    expect(board().cards.k1.github!.state).toBe("open");
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("gh auth login"));
  });

  it("still closes the issue when the Project cannot be read (missing scope)", async () => {
    mockGithub({
      github_list_project_items: () => {
        throw { kind: "github", message: "Access to GitHub Projects denied: run `gh auth refresh -s project`." };
      },
      github_project_statuses: () => [],
    });
    await moveCardWithGithub("b", "k1", "done");
    expect(calls.map(([cmd]) => cmd)).toContain("github_set_issue_state");
    expect(board().cards.k1.github!.state).toBe("closed");
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("gh auth refresh -s project"));
  });

  it("moves a card without a link locally only", async () => {
    await moveCardWithGithub("b", "k2", "doing", 0);
    expect(calls).toEqual([]);
    expect(board().columns.find((c) => c.id === "doing")!.cardIds).toEqual(["k2"]);
  });
});

describe("createIssueForCard", () => {
  it("creates the issue from the card and links it", async () => {
    mockGithub({ github_create_issue: () => ({ number: 42, url: "https://github.com/o/r/issues/42" }) });
    expect(await createIssueForCard("b", "k2")).toBe(true);
    expect(calls).toEqual([["github_create_issue", { path: "C:/r", repo: "o/r", title: "Local", body: "keep" }]]);
    expect(board().cards.k2.github).toEqual({ repo: "o/r", number: 42, url: "https://github.com/o/r/issues/42", state: "open" });
  });

  it("does nothing for a card already linked", async () => {
    expect(await createIssueForCard("b", "k1")).toBe(false);
    expect(calls).toEqual([]);
  });
});
