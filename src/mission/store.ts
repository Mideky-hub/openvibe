import { canvasStore } from "@/canvas/canvasStore";
import { framesFromScene, groupOf } from "@/canvas/groups";
import { cachedElements, loadScene } from "@/canvas/sceneCache";
import { AGENTS } from "@/fleet/catalog";
import { linkedAgents, NO_LINKS, orchestratorLinks } from "@/fleet/wires";
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

/** Whether the orchestrator's workspace is on screen. The home screen leaves it active, with no canvas mounted. */
export function orchestratorShown(orchestratorId: string): boolean {
  const record = nodesStore.getState().nodes[orchestratorId];
  return record !== undefined && record.workspaceId === workspacesStore.getState().activeId && canvasStore.getState().api !== null;
}

/** A workspace's wires and groups: live on screen, from its stored scene otherwise (spec mission de nuit §6.1). */
export function workspaceCanvas(workspaceId: string | undefined): Pick<ReturnType<typeof canvasStore.getState>, "frames" | "links"> {
  const shown = workspaceId === workspacesStore.getState().activeId && canvasStore.getState().api !== null;
  if (workspaceId === undefined || shown) return canvasStore.getState();
  const elements = cachedElements(workspaceId) ?? [];
  return { frames: framesFromScene(elements), links: orchestratorLinks(elements) };
}

/** Whether the orchestrator's canvas is known: on screen, or its scene was read. */
export function canvasKnown(orchestratorId: string): boolean {
  const record = nodesStore.getState().nodes[orchestratorId];
  return record !== undefined && (orchestratorShown(orchestratorId) || cachedElements(record.workspaceId) !== undefined);
}

/** Whether the orchestrator's canvas is known, its saved scene read first if it never was since startup (#69). */
export async function readCanvas(orchestratorId: string): Promise<boolean> {
  const record = nodesStore.getState().nodes[orchestratorId];
  if (!record || canvasKnown(orchestratorId)) return record !== undefined;
  // An unreadable scene leaves it unknown: the tools say so rather than guess.
  await loadScene(record.workspaceId).catch((error: unknown) => console.warn("orchestrator's scene not read", error));
  return canvasKnown(orchestratorId);
}

const canvasOfNode = (nodeId: string) => workspaceCanvas(nodesStore.getState().nodes[nodeId]?.workspaceId);

/** The linked agents each launch under way has read free: its team is not stored before its worktrees exist. */
const enrolling = new Map<string, readonly string[]>();

export function reserveAgents(orchestratorId: string, nodeIds: readonly string[]) {
  enrolling.set(orchestratorId, nodeIds);
}

export function releaseAgents(orchestratorId: string) {
  enrolling.delete(orchestratorId);
}

/**
 * Whether an agent works for another orchestrator's mission: being enrolled by
 * its launch, or a member of it running, its sub-task typed or not yet (#64).
 */
export function inOtherMission(nodeId: string, orchestratorId: string): boolean {
  for (const [id, nodeIds] of enrolling) if (id !== orchestratorId && nodeIds.includes(nodeId)) return true;
  // Unlike memberOf, before its sub-task is typed: it is already moving to that mission's worktree.
  return Object.entries(nodesStore.getState().nodes).some(([id, record]) => {
    const mission = missionOf(record);
    return id !== orchestratorId && mission?.state === "en_cours" && !closedOrchestrators.has(id) && mission.members.some((m) => m.nodeId === nodeId);
  });
}

function linkedClaude(orchestratorId: string): { nodeId: string; name: string; busy: boolean }[] {
  const { links, frames } = canvasOfNode(orchestratorId);
  const nodes = nodesStore.getState().nodes;
  return linkedAgents(links[orchestratorId] ?? NO_LINKS, frames).agentIds.flatMap((nodeId) => {
    const payload = terminalOf(nodes[nodeId]);
    return payload?.agent === "claude" ? [{ nodeId, name: payload.name || AGENTS.claude.label, busy: inOtherMission(nodeId, orchestratorId) }] : [];
  });
}

/** The Claude agents wired to an orchestrator: only they have OpenVibe's tools for a mission (spec §2). */
export function linkedClaudeAgents(orchestratorId: string): { nodeId: string; name: string }[] {
  // An agent already working for another running mission is not free to be enrolled in this one.
  return linkedClaude(orchestratorId).flatMap(({ nodeId, name, busy }) => (busy ? [] : [{ nodeId, name }]));
}

/** The names of the Claude agents wired to an orchestrator that another mission holds: to say why they are refused. */
export function busyLinkedAgents(orchestratorId: string): string[] {
  return linkedClaude(orchestratorId).flatMap(({ name, busy }) => (busy ? [name] : []));
}

/** The groups wired to an orchestrator, with what each is for (spec groupes spécialisés §3). */
export function linkedGroups(orchestratorId: string): { id: string; name: string; speciality: string | null }[] {
  const { links, frames } = canvasOfNode(orchestratorId);
  return linkedAgents(links[orchestratorId] ?? NO_LINKS, frames).groups.map((f) => ({ id: f.id, name: f.name, speciality: f.group?.speciality ?? null }));
}

/** An agent's group and speciality as the orchestrator reads them: null without one. */
export function agentGroup(nodeId: string): { group: string | null; speciality: string | null } {
  const group = groupOf(canvasOfNode(nodeId).frames, nodeId);
  return { group: group?.name ?? null, speciality: group?.group.speciality ?? null };
}

/** The group a member belongs to: the one it joined, else the one it stands in. */
export function memberGroupId(member: Member): string | null {
  return member.group ?? groupOf(canvasOfNode(member.nodeId).frames, member.nodeId)?.id ?? null;
}

/** The group of a member with its name, for the mission map (#63): null when it stands in none. */
export function memberGroupOf(member: Member): { id: string; name: string } | null {
  const id = memberGroupId(member);
  const frame = id === null ? undefined : canvasOfNode(member.nodeId).frames.find((f) => f.id === id);
  return id === null ? null : { id, name: frame?.name ?? "" };
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
