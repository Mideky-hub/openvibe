// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockIPC } from "@tauri-apps/api/mocks";
import { notify } from "@/mission/events";
import type { Member, SubTask } from "@/mission/mission";
import type { KanbanPayload } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { moveCardWithGithub } from "./github";
import { finishMissionCard, linkedBoards, planWithOrchestrator, startMissionCards } from "./orchestrate";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("@/mission/events", () => ({ notify: vi.fn() }));
vi.mock("@/fleet/orchestrators", () => ({ addOrchestrator: vi.fn(() => Promise.resolve(null)) }));
vi.mock("./github", async (importOriginal) => {
  const { moveCard } = await import("./board");
  return {
    ...(await importOriginal<typeof import("./github")>()),
    // The move without GitHub: the board's own.
    moveCardWithGithub: vi.fn(async (nodeId: string, cardId: string, columnId: string) => {
      const record = nodesStore.getState().nodes[nodeId];
      if (record?.kind === "kanban") nodesStore.getState().update(nodeId, moveCard(record.payload, cardId, columnId));
    }),
  };
});

const boardOf = () => (nodesStore.getState().nodes.k1 as { payload: KanbanPayload }).payload;
const member = (name: string, task: string) => ({ nodeId: name, name, task, budgetMin: 5, linked: false, branch: "b", worktree: "w" }) as Member;

beforeAll(async () => {
  mockIPC(() => undefined);
  await nodesStore.getState().create("chef", { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } });
  await nodesStore.getState().create("k1", {
    workspaceId: "w1",
    kind: "kanban",
    payload: {
      columns: [
        { id: "todo", title: "À faire", cardIds: ["c1", "c2"] },
        { id: "done", title: "Fait", cardIds: [] },
      ],
      cards: { c1: { id: "c1", title: "Login", notes: "OAuth", priority: "high" }, c2: { id: "c2", title: "API", notes: "", priority: "none" } },
    },
  });
});

describe("the Kanban handed to an orchestrator", () => {
  it("types the column's cards in its terminal and remembers the link", async () => {
    expect(await planWithOrchestrator("k1", "todo", "chef")).toBe(true);
    expect(boardOf().orchestrator).toEqual({ nodeId: "chef", columnId: "todo" });
    expect(linkedBoards("chef").map((b) => b.nodeId)).toEqual(["k1"]);
    const line = vi.mocked(notify).mock.calls[0];
    expect(line[0]).toBe("chef");
    expect(line[1]).toContain("[c1] Login — OAuth");
    expect(line[1]).toContain("propose_plan");
  });

  it("refuses an empty column", async () => {
    expect(await planWithOrchestrator("k1", "done", "chef")).toBe(false);
  });

  it("moves the cards « En cours » with their agent, then to done on its report", async () => {
    const plan: SubTask[] = [
      { title: "Login", brief: "b", agent: "nouveau", budgetMin: 5, card: "c1" },
      { title: "Docs", brief: "b", agent: "nouveau", budgetMin: 5 },
    ];
    await startMissionCards("chef", [member("Amon", "Login"), member("Thot", "Docs")], plan);
    const started = boardOf();
    expect(started.columns.map((c) => c.title)).toEqual(["À faire", "En cours", "Fait"]);
    expect(started.columns[1].cardIds).toEqual(["c1"]);
    expect(started.cards.c1.agent).toBe("Amon");
    await finishMissionCard("chef", plan, "Login");
    expect(boardOf().columns[2].cardIds).toEqual(["c1"]);
    expect(moveCardWithGithub).toHaveBeenLastCalledWith("k1", "c1", "done");
    // Nothing for a sub-task without a card.
    vi.mocked(moveCardWithGithub).mockClear();
    await finishMissionCard("chef", plan, "Docs");
    expect(moveCardWithGithub).not.toHaveBeenCalled();
  });
});
