import { useStore } from "zustand";
import { agentActivityStore, useActivities } from "@/store/agentActivity";
import { nodesStore, useNodes, type NodeRecord } from "@/store/nodes";
import { terminalStatusStore } from "@/store/terminalStatus";
import { useWorkspaces, workspacesStore } from "@/store/workspaces";
import { AGENTS } from "./catalog";

/** An agent stopped until the user answers it (spec notification §3). */
export interface WaitingAgent {
  id: string;
  kind: NodeRecord["kind"];
  name: string;
  workspaceId: string;
  /** Since when it waits, in ms. */
  since: number;
}

/** A terminal without a first name goes by its agent's name; an orchestrator always has one. */
function nameOf(record: NodeRecord): string {
  return record.kind === "terminal" ? record.payload.name || AGENTS[record.payload.agent].label : record.payload.name;
}

/** The running agents of `workspaceIds` waiting for an answer, the one waiting longest first. */
export function waitingAgents(
  workspaceIds: readonly string[],
  nodes: Readonly<Record<string, NodeRecord>>,
  statuses: Readonly<Record<string, { state: string } | undefined>>,
  activities: Readonly<Record<string, { activity: string; since: number } | undefined>>,
): WaitingAgent[] {
  const wanted = new Set(workspaceIds);
  const agents: WaitingAgent[] = [];
  for (const [id, record] of Object.entries(nodes)) {
    const activity = activities[id];
    if (!wanted.has(record.workspaceId) || statuses[id]?.state !== "running" || activity?.activity !== "waiting") continue;
    agents.push({ id, kind: record.kind, name: nameOf(record), workspaceId: record.workspaceId, since: activity.since });
  }
  return agents.sort((a, b) => a.since - b.since || a.id.localeCompare(b.id));
}

/** The agents waiting in the open project, at this moment. */
export function currentWaitingAgents(): WaitingAgent[] {
  return waitingAgents(
    workspacesStore.getState().workspaces.map((w) => w.id),
    nodesStore.getState().nodes,
    terminalStatusStore.getState().statuses,
    agentActivityStore.getState().activities,
  );
}

/** The agents waiting in the open project, in every workspace. */
export function useWaitingAgents(): WaitingAgent[] {
  const workspaces = useWorkspaces((s) => s.workspaces);
  const nodes = useNodes((s) => s.nodes);
  const statuses = useStore(terminalStatusStore, (s) => s.statuses);
  const activities = useActivities();
  return waitingAgents(
    workspaces.map((w) => w.id),
    nodes,
    statuses,
    activities,
  );
}

/** The agent after `currentId`, looping; the first one when `currentId` does not wait. */
export function nextWaiting(agents: readonly WaitingAgent[], currentId: string | null): WaitingAgent | undefined {
  return agents[(agents.findIndex((a) => a.id === currentId) + 1) % agents.length];
}
