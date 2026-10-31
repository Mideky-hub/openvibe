import { canvasStore } from "@/canvas/canvasStore";
import { groupOf } from "@/canvas/groups";
import { AGENTS } from "@/fleet/catalog";
import { linkedAgents, NO_LINKS } from "@/fleet/wires";
import { agentActivityStore } from "@/store/agentActivity";
import { nodesStore, terminalOf, type NodeRecord } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { workspacesStore } from "@/store/workspaces";
import { budgetOf, NEW_MISSION, spentMin, type Member, type Mission } from "./mission";

/** An orchestrator's mission — a fresh one until it has its own; undefined for any other node. */
export function missionOf(record: NodeRecord | undefined): Mission | undefined {
  return record?.kind === "orchestrator" ? (record.payload.mission ?? NEW_MISSION) : undefined;
}

export function setMission(orchestratorId: string, patch: Partial<Mission>) {
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (mission) nodesStore.getState().update(orchestratorId, { mission: { ...mission, ...patch } });
}

export function updateMember(orchestratorId: string, nodeId: string, patch: Partial<Member>) {
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (mission) setMission(orchestratorId, { members: mission.members.map((m) => (m.nodeId === nodeId ? { ...m, ...patch } : m)) });
}

/**
 * Orchestrators deleted from the canvas. Their record stays for an undo, and so
 * does their mission: it waits, unheard, until the undo brings them back
 * (spec première version §5.4).
 */
const closedOrchestrators = new Set<string>();

export function setOrchestratorClosed(orchestratorId: string, closed: boolean) {
  if (closed) closedOrchestrators.add(orchestratorId);
  else closedOrchestrators.delete(orchestratorId);
}

export function isOrchestratorClosed(orchestratorId: string): boolean {
  return closedOrchestrators.has(orchestratorId);
}

/**
 * The running mission an agent works for, once its sub-task was sent (spec §7.5);
 * a closed orchestrator's only with `evenClosed`.
 */
export function memberOf(nodeId: string, { evenClosed = false } = {}): { orchestratorId: string; member: Member } | null {
  for (const [orchestratorId, record] of Object.entries(nodesStore.getState().nodes)) {
    const mission = missionOf(record);
    if (mission?.state !== "en_cours") continue;
    if (!evenClosed && closedOrchestrators.has(orchestratorId)) continue;
    const member = mission.members.find((m) => m.nodeId === nodeId && m.sentAt !== undefined);
    if (member) return { orchestratorId, member };
  }
  return null;
}

/** Whether the orchestrator's workspace is on screen: its canvas — wires, groups — is only known then (final review H2). */
export function orchestratorShown(orchestratorId: string): boolean {
  const record = nodesStore.getState().nodes[orchestratorId];
  return record !== undefined && record.workspaceId === workspacesStore.getState().activeId;
}

/** The Claude agents wired to an orchestrator: only they have OpenVibe's tools for a mission (spec §2). */
export function linkedClaudeAgents(orchestratorId: string): { nodeId: string; name: string }[] {
  const { links, frames } = canvasStore.getState();
  const nodes = nodesStore.getState().nodes;
  return linkedAgents(links[orchestratorId] ?? NO_LINKS, frames).agentIds.flatMap((nodeId) => {
    const payload = terminalOf(nodes[nodeId]);
    return payload?.agent === "claude" ? [{ nodeId, name: payload.name || AGENTS.claude.label }] : [];
  });
}

/** The groups wired to an orchestrator, with what each is for (spec groupes spécialisés §3). */
export function linkedGroups(orchestratorId: string): { id: string; name: string; speciality: string | null }[] {
  const { links, frames } = canvasStore.getState();
  return linkedAgents(links[orchestratorId] ?? NO_LINKS, frames).groups.map((f) => ({ id: f.id, name: f.name, speciality: f.group?.speciality ?? null }));
}

/** An agent's group and speciality as the orchestrator reads them: null without one. */
export function agentGroup(nodeId: string): { group: string | null; speciality: string | null } {
  const group = groupOf(canvasStore.getState().frames, nodeId);
  return { group: group?.name ?? null, speciality: group?.group.speciality ?? null };
}

export type AgentState = "travaille" | "attend" | "inactif" | "arrêté";

/** An agent's state as the orchestrator reads it (spec §7.2 `equipe`). */
export function agentState(nodeId: string): AgentState {
  if (!isRunning(nodeId)) return "arrêté";
  const activity = agentActivityStore.getState().activities[nodeId]?.activity;
  return activity === "working" ? "travaille" : activity === "waiting" ? "attend" : "inactif";
}

/** The time and budget of each agent of a running mission, by node (spec §8.3). */
export function memberBudgets(nodes: Record<string, NodeRecord>, now: number): Record<string, { spent: number; budget: number }> {
  const budgets: Record<string, { spent: number; budget: number }> = {};
  for (const [orchestratorId, record] of Object.entries(nodes)) {
    const mission = missionOf(record);
    // A closed orchestrator's mission draws no bar (final review R3).
    if (mission?.state !== "en_cours" || closedOrchestrators.has(orchestratorId)) continue;
    for (const m of mission.members) {
      if (m.sentAt !== undefined && !m.handedTo) budgets[m.nodeId] = { spent: spentMin(m, now), budget: budgetOf(m) };
    }
  }
  return budgets;
}
