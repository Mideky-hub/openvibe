import { canvasStore } from "@/canvas/canvasStore";
import { groupPantheons } from "@/canvas/groups";
import { nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { nextName, nextPantheon } from "./names";

/** Names already carried by the terminals of a workspace. */
export function namesInWorkspace(workspaceId: string): string[] {
  return Object.values(nodesStore.getState().nodes)
    .flatMap((node) => (node.workspaceId === workspaceId && node.kind === "terminal" && node.payload.name ? [node.payload.name] : []));
}

/** The pantheon of the agents outside groups; it avoids those of the groups on screen. */
function outsidePantheon(workspaceId: string): Promise<string> {
  return workspacesStore.getState().ensurePantheon(workspaceId, groupPantheons(canvasStore.getState().frames));
}

/**
 * The name of an agent about to be created (spec habillage §9.2): from its
 * group's pantheon, or from the workspace's pantheon outside groups.
 */
export async function nameForNewAgent(workspaceId: string, groupPantheon?: string): Promise<string> {
  const pantheon = groupPantheon ?? (await outsidePantheon(workspaceId));
  return nextName(pantheon, namesInWorkspace(workspaceId));
}

/** The pantheon of a new group: the first one neither the groups nor the agents outside them use. */
export function pantheonForNewGroup(workspaceId: string): string {
  const workspace = workspacesStore.getState().workspaces.find((w) => w.id === workspaceId);
  return nextPantheon([workspace?.pantheon, ...groupPantheons(canvasStore.getState().frames)]);
}

/** Names the terminals saved before names existed, in scene order. */
export async function assignMissingNames(workspaceId: string, orderedIds: readonly string[]): Promise<void> {
  const unnamed = () => {
    const nodes = nodesStore.getState().nodes;
    return orderedIds.filter((id) => nodes[id]?.kind === "terminal" && !nodes[id].payload.name);
  };
  if (unnamed().length === 0) return;
  const pantheon = await outsidePantheon(workspaceId);
  // Read again after the wait: a concurrent pass (StrictMode runs effects twice)
  // may have named some of them already.
  const taken = namesInWorkspace(workspaceId);
  for (const id of unnamed()) {
    const name = nextName(pantheon, taken);
    taken.push(name);
    nodesStore.getState().update(id, { name });
  }
}
