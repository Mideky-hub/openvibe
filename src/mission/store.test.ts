import { beforeEach, describe, expect, it, vi } from "vitest";
import { canvasStore } from "@/canvas/canvasStore";
import { nodesStore, type NodeRecord } from "@/store/nodes";
import { NEW_MISSION } from "./mission";
import { rememberScene, forgetScene } from "@/canvas/sceneCache";
import { workspacesStore } from "@/store/workspaces";
import { agentGroup, busyLinkedAgents, canvasKnown, linkedClaudeAgents, linkedGroups, memberBudgets, memberOf, orchestratorShown, releaseAgents, reserveAgents, setOrchestratorClosed, workspaceCanvas } from "./store";

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

  beforeEach(() => {
    nodesStore.setState({ nodes: {} });
    canvasStore.setState({
      frames: [frame("g1", "Interface", ["isis"], "Frontend"), frame("g2", "Serveur", ["horus"]), frame("g3", "Loin", ["seth"], "Tests")],
      links: { chef: { groupIds: ["g1", "g2"], nodeIds: [] } },
    });
  });

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

describe("a workspace not on screen (spec mission de nuit §6.1)", () => {
  const terminal = { title: "", name: "Isis", agent: "claude" as const, cwd: "C:/", shell: "default" as const, command: "" };
  const frame = { id: "g1", type: "frame", name: "Interface", x: 0, y: 0, width: 10, height: 10, isDeleted: false, frameId: null, customData: { openvibe: { kind: "group", role: "frontend", pantheon: "norse", speciality: "Frontend" } } };
  const isis = { id: "isis", type: "embeddable", isDeleted: false, frameId: "g1", x: 0, y: 0, width: 1, height: 1, customData: { kind: "terminal" } };
  const chef = { id: "chef", type: "embeddable", isDeleted: false, frameId: null, x: 0, y: 0, width: 1, height: 1, customData: { kind: "orchestrator" } };
  const wire = { id: "w", type: "arrow", isDeleted: false, frameId: null, startBinding: { elementId: "chef" }, endBinding: { elementId: "g1" } };

  beforeEach(() => {
    nodesStore.setState({ nodes: { chef: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Chef" } }, isis: { workspaceId: "w1", kind: "terminal", payload: terminal } } });
    workspacesStore.setState({ activeId: "w2" });
    canvasStore.setState({ frames: [], links: {} });
    rememberScene("w1", [frame, isis, chef, wire] as never, {} as never, {}, []);
  });

  it("reads wires and groups from its stored scene, not from the canvas on screen", () => {
    expect(linkedClaudeAgents("chef")).toEqual([{ nodeId: "isis", name: "Isis" }]);
    expect(linkedGroups("chef")).toEqual([{ id: "g1", name: "Interface", speciality: "Frontend" }]);
    expect(agentGroup("isis")).toEqual({ group: "Interface", speciality: "Frontend" });
    expect(workspaceCanvas("w1").frames.map((f) => f.id)).toEqual(["g1"]);
    expect(canvasKnown("chef")).toBe(true);
  });

  it("is unknown only when its scene was never read", () => {
    forgetScene("w1");
    expect(canvasKnown("chef")).toBe(false);
    expect(linkedClaudeAgents("chef")).toEqual([]);
  });

  it("reads the live canvas when it is the one on screen", () => {
    workspacesStore.setState({ activeId: "w1" });
    canvasStore.setState({ api: {} as never });
    expect(linkedClaudeAgents("chef")).toEqual([]);
    expect(canvasKnown("chef")).toBe(true);
    canvasStore.setState({ api: null });
    forgetScene("w1");
  });

  it("reads its stored scene from the home screen: the workspace is still the active one, no canvas is mounted (review)", () => {
    workspacesStore.setState({ activeId: "w1" });
    expect(orchestratorShown("chef")).toBe(false);
    expect(linkedClaudeAgents("chef")).toEqual([{ nodeId: "isis", name: "Isis" }]);
    forgetScene("w1");
  });
});

describe("an agent wired to two orchestrators (backlog H2)", () => {
  const member = { name: "Isis", task: "Login", budgetMin: 10, linked: true, branch: "b", worktree: "w", sentAt: 0 };
  const terminal = { title: "", name: "Isis", agent: "claude" as const, cwd: "C:/", shell: "default" as const, command: "" };
  const busyWith = (extra: object) => ({ workspaceId: "w1", kind: "orchestrator" as const, payload: { name: "Busy", mission: { ...NEW_MISSION, state: "en_cours" as const, members: [{ ...member, nodeId: "isis", ...extra }] } } });

  beforeEach(() => {
    nodesStore.setState({
      nodes: {
        isis: { workspaceId: "w1", kind: "terminal", payload: terminal },
        busy: busyWith({}),
        free: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Free" } },
      },
    });
    canvasStore.setState({ api: {} as never, links: { busy: { nodeIds: ["isis"], groupIds: [] }, free: { nodeIds: ["isis"], groupIds: [] } }, frames: [] });
  });

  it("is not offered to one while it works for the other's running mission", () => {
    expect(linkedClaudeAgents("free")).toEqual([]);
    expect(busyLinkedAgents("free")).toEqual(["Isis"]);
    expect(linkedClaudeAgents("busy").map((a) => a.nodeId)).toEqual(["isis"]);
    expect(busyLinkedAgents("busy")).toEqual([]);
  });

  it("is not offered either before its sub-task was typed: it is already moving to the other's worktree (#64)", () => {
    nodesStore.setState({ nodes: { ...nodesStore.getState().nodes, busy: busyWith({ sentAt: undefined }) } });
    expect(linkedClaudeAgents("free")).toEqual([]);
    expect(busyLinkedAgents("free")).toEqual(["Isis"]);
  });

  it("is not offered while the other's launch enrolls it, and is free again once released (#64)", () => {
    nodesStore.setState({ nodes: { ...nodesStore.getState().nodes, busy: { workspaceId: "w1", kind: "orchestrator", payload: { name: "Busy" } } } });
    reserveAgents("busy", ["isis"]);
    expect(linkedClaudeAgents("free")).toEqual([]);
    expect(linkedClaudeAgents("busy").map((a) => a.nodeId)).toEqual(["isis"]);
    releaseAgents("busy");
    expect(linkedClaudeAgents("free").map((a) => a.nodeId)).toEqual(["isis"]);
  });
});
