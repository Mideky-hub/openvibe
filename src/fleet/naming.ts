import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { canvasStore } from "@/canvas/canvasStore";
import { groupInfoOf, groupPantheons } from "@/canvas/groups";
import { nodeKindOf } from "@/canvas/nodeElement";
import { nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { nextName, nextPantheon } from "./names";

/**
 * Names already carried by the terminals of a workspace. A closed terminal's
 * node stays in memory for Ctrl+Z but is off the canvas: its name is free again.
 */
export function namesInWorkspace(workspaceId: string): string[] {
  const scene = canvasStore.getState().api?.getSceneElements();
  const onCanvas = scene ? new Set(scene.map((e) => e.id)) : null;
  return Object.entries(nodesStore.getState().nodes)
    .filter(([id, node]) => node.workspaceId === workspaceId && node.kind === "terminal" && node.payload.name && (!onCanvas || onCanvas.has(id)))
    .map(([, node]) => node.payload.name);
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

/**
 * Groups copied whole (Ctrl+D, copy-paste) arrive with the pantheon of the
 * original: two groups would share their names. The copy, a group frame all of
 * whose agents are copies while another frame has the same pantheon, gets a
 * pantheon of its own; frame id → pantheon (plan B1).
 */
export function pantheonsForCopiedGroups(
  elements: readonly ExcalidrawElement[],
  copyIds: ReadonlySet<string>,
  workspacePantheon: string | null | undefined,
): Map<string, string> {
  const live = elements.filter((e) => !e.isDeleted);
  const groups = live.filter((e) => groupInfoOf(e) !== null);
  const used = [workspacePantheon, ...groups.map((g) => groupInfoOf(g)?.pantheon)];
  const remapped = new Map<string, string>();
  for (const group of groups) {
    const pantheon = groupInfoOf(group)?.pantheon;
    const members = live.filter((e) => e.frameId === group.id && nodeKindOf(e) === "terminal");
    const allCopies = members.length > 0 && members.every((m) => copyIds.has(m.id));
    const sharedWithOther = groups.some((other) => other.id !== group.id && groupInfoOf(other)?.pantheon === pantheon);
    if (!allCopies || !sharedWithOther) continue;
    const next = nextPantheon(used);
    used.push(next);
    remapped.set(group.id, next);
  }
  return remapped;
}
