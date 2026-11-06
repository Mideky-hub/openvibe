import { canvasStore } from "@/canvas/canvasStore";
import { groupInfoOf } from "@/canvas/groups";
import { cachedElements } from "@/canvas/sceneCache";
import { messages } from "@/i18n";
import { nodesStore } from "@/store/nodes";
import { workspacesStore } from "@/store/workspaces";
import { fleetMessages } from "./messages";
import { ROLES } from "./roles";

/** A workspace's scene, on screen or stored; not `sceneAccess`, which would load Excalidraw into every terminal's start. */
function sceneOf(workspaceId: string) {
  const { api } = canvasStore.getState();
  return api && workspaceId === workspacesStore.getState().activeId ? api.getSceneElementsIncludingDeleted() : cachedElements(workspaceId);
}

/**
 * What a Claude agent is told of its group when it starts: its name, role and
 * speciality (issue #66). Read from the scene, not the canvas's frames: an
 * agent starts as soon as it mounts, before React has told them.
 */
export function teamBrief(nodeId: string): string | undefined {
  const workspaceId = nodesStore.getState().nodes[nodeId]?.workspaceId;
  const elements = workspaceId ? sceneOf(workspaceId) : undefined;
  const terminal = elements?.find((e) => e.id === nodeId && !e.isDeleted);
  const frame = terminal?.frameId ? elements?.find((e) => e.id === terminal.frameId && !e.isDeleted) : undefined;
  const info = frame ? groupInfoOf(frame) : null;
  // A mission's group is general with no speciality: nothing worth telling.
  if (!frame || frame.type !== "frame" || !info || (info.role === "general" && !info.speciality)) return undefined;
  return messages(fleetMessages).teamBrief(frame.name ?? "", ROLES[info.role].label, info.speciality);
}
