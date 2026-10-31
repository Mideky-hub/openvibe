import { beforeEach, describe, expect, it, vi } from "vitest";
import { canvasStore } from "@/canvas/canvasStore";
import { nodesStore, type NodeRecord } from "@/store/nodes";
import { NEW_MISSION } from "./mission";
import { agentGroup, linkedClaudeAgents, linkedGroups, memberBudgets, memberOf, setOrchestratorClosed } from "./store";

vi.mock("@excalidraw/excalidraw", () => ({}));

it("gives each agent of a running mission its time and budget, for the bars (spec orchestrateur §8.3)", () => {
  const member = { name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w" };
  const nodes: Record<string, NodeRecord> = {
    chef: {
      workspaceId: "w1",
      kind: "orchestrator",
      payload: { name: "Chef", mission: { ...NEW_MISSION, state: "en_cours", members: [{ ...member, nodeId: "isis", sentAt: 0, extraMin: 5 }, { ...member, nodeId: "horus" }, { ...member, nodeId: "seth", sentAt: 0, handedTo: "Isis" }] } },
    },
    fini: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Fini", mission: { ...NEW_MISSION, state: "terminee", members: [{ ...member, nodeId: "thot", sentAt: 0 }] } } },
  };
  expect(memberBudgets(nodes, 6 * 60_000)).toEqual({ isis: { spent: 6, budget: 15 } });
});

it("forgets the mission of a closed orchestrator until an undo brings it back (spec première version §5.4)", () => {
  const member = { nodeId: "isis", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0 };
  nodesStore.setState({
    nodes: { chef: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef", mission: { ...NEW_MISSION, state: "en_cours", members: [member] } } } },
  });
  expect(memberOf("isis")?.orchestratorId).toBe("chef");
  setOrchestratorClosed("chef", true);
  expect(memberOf("isis")).toBeNull();
  expect(memberOf("isis", { evenClosed: true })?.orchestratorId).toBe("chef");
  setOrchestratorClosed("chef", false);
  expect(memberOf("isis")?.orchestratorId).toBe("chef");
});

describe("what the orchestrator reads of the groups (spec groupes spécialisés §3)", () => {
  const frame = (id: string, name: string, memberIds: string[], speciality?: string) => ({
    id, name, x: 0, y: 0, width: 10, height: 10, memberIds, group: { role: "general" as const, pantheon: "egyptian", ...(speciality ? { speciality } : {}) },
  });

  beforeEach(() =>
    canvasStore.setState({
      frames: [frame("g1", "Interface", ["isis"], "Frontend"), frame("g2", "Serveur", ["horus"]), frame("g3", "Loin", ["seth"], "Tests")],
      links: { chef: { groupIds: ["g1", "g2"], nodeIds: [] } },
    }),
  );

  it("lists the groups wired to it, with or without a speciality", () => {
    expect(linkedGroups("chef")).toEqual([
      { id: "g1", name: "Interface", speciality: "Frontend" },
      { id: "g2", name: "Serveur", speciality: null },
    ]);
    expect(linkedGroups("autre")).toEqual([]);
  });

  it("tells an agent's group and speciality; outside a group, nothing", () => {
    expect(agentGroup("isis")).toEqual({ group: "Interface", speciality: "Frontend" });
    expect(agentGroup("horus")).toEqual({ group: "Serveur", speciality: null });
    expect(agentGroup("seul")).toEqual({ group: null, speciality: null });
  });
});

it("draws no budget bar for a closed orchestrator's mission (final review R3)", () => {
  const member = { nodeId: "isis", name: "Isis", task: "Login", budgetMin: 10, linked: false, branch: "b", worktree: "w", sentAt: 0 };
  const nodes: Record<string, NodeRecord> = {
    chef: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef", mission: { ...NEW_MISSION, state: "en_cours", members: [member] } } },
  };
  setOrchestratorClosed("chef", true);
  expect(memberBudgets(nodes, 60 * 60_000)).toEqual({});
  setOrchestratorClosed("chef", false);
  expect(memberBudgets(nodes, 60 * 60_000)).toEqual({ isis: { spent: 60, budget: 10 } });
});

it("does not offer an agent already in another running mission (backlog H2)", () => {
  const member = { name: "Isis", task: "Login", budgetMin: 10, linked: true, branch: "b", worktree: "w", sentAt: 0 };
  const terminal = { title: "", name: "Isis", agent: "claude" as const, cwd: "C:/", shell: "default" as const, command: "" };
  nodesStore.setState({
    nodes: {
      isis: { workspaceId: "w1", kind: "terminal", payload: terminal },
      busy: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Busy", mission: { ...NEW_MISSION, state: "en_cours", members: [{ ...member, nodeId: "isis" }] } } },
      free: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Free" } },
    },
  });
  canvasStore.setState({ links: { busy: { nodeIds: ["isis"], groupIds: [] }, free: { nodeIds: ["isis"], groupIds: [] } }, frames: [] });
  expect(linkedClaudeAgents("free")).toEqual([]);
  expect(linkedClaudeAgents("busy").map((a) => a.nodeId)).toEqual(["isis"]);
});
