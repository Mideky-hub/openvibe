import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { isGroup } from "@/canvas/groups";
import { createNodeElement } from "@/canvas/nodeElement";
import { allowRemoval } from "@/canvas/removalGuard";
import { orchestratorSession } from "@/nodes/terminal/launch";
import { markForAutostart } from "@/nodes/terminal/registry";
import { messages } from "@/i18n";
import { nodesMessages } from "@/nodes/messages";
import { nodesStore } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { uiStore } from "@/store/ui";
import { workspacesStore } from "@/store/workspaces";
import { claudeInstalled } from "./agentsStore";
import { orchestratorSpot } from "./groupLayout";
import { defaultLaunchOptions } from "./launchAgent";
import { fleetMessages } from "./messages";
import type { Point } from "./terminals";
import { withWire } from "./wires";

/** A new orchestrator with its Claude session, which starts when it is shown (spec orchestrateur §6). */
async function createOrchestrator(id: string, workspaceId: string) {
  // A new orchestrator is named in the interface's language (spec première version §7.1).
  const name = messages(nodesMessages).orchestrator.defaultName;
  const session = orchestratorSession(name, defaultLaunchOptions());
  await nodesStore.getState().create(id, { workspaceId, kind: "orchestrator", payload: { name, session } });
  markForAutostart(id);
}

/** An orchestrator runs Claude Code: without it, nothing is created (spec première version §7.2). */
async function refusedWithoutClaude(): Promise<boolean> {
  if (await claudeInstalled()) return false;
  toast.error(messages(fleetMessages).noClaude);
  return true;
}

/** "Relier un orchestrateur" of the group menu: a new orchestrator left of the group, wired to it, in one undo step. */
export async function orchestrateGroup(groupId: string) {
  const api = canvasStore.getState().api;
  const workspaceId = workspacesStore.getState().activeId;
  const group = canvasStore.getState().frames.find((f) => f.id === groupId);
  if (!api || !workspaceId || !group || !isGroup(group) || (await refusedWithoutClaude())) return;
  const element = createNodeElement("orchestrator", orchestratorSpot(group));
  await createOrchestrator(element.id, workspaceId);
  api.updateScene({
    elements: withWire([...api.getSceneElementsIncludingDeleted(), element], element.id, groupId),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** The menu's "Orchestrateur", placed with a click like an agent (spec habillage §10.1). Its id, null when none was made. */
export async function addOrchestrator(workspaceId: string, center: Point): Promise<string | null> {
  const api = canvasStore.getState().api;
  if (!api || (await refusedWithoutClaude())) return null;
  const element = createNodeElement("orchestrator", center);
  await createOrchestrator(element.id, workspaceId);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return element.id;
}

/** One click of "Relier" (spec habillage §13). */
export function linkOrchestrator(orchestratorId: string, targetId: string) {
  const api = canvasStore.getState().api;
  if (!api) return;
  api.updateScene({
    elements: withWire(api.getSceneElementsIncludingDeleted(), orchestratorId, targetId),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

type Bound = { id: string; type: string; isDeleted?: boolean; startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null };

/** The wires of an orchestrator still on the canvas: they go with it. */
function orchestratorWires(elements: readonly Bound[], orchestratorId: string): string[] {
  return elements
    .filter((e) => !e.isDeleted && e.type === "arrow" && (e.startBinding?.elementId === orchestratorId || e.endBinding?.elementId === orchestratorId))
    .map((e) => e.id);
}

/** The × of an orchestrator: it and its wires go, in one undo step. */
export function removeOrchestrator(orchestratorId: string) {
  const api = canvasStore.getState().api;
  if (!api) return;
  allowRemoval([orchestratorId]);
  const going = new Set([orchestratorId, ...orchestratorWires(api.getSceneElementsIncludingDeleted(), orchestratorId)]);
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((e) => (!e.isDeleted && going.has(e.id) ? newElementWith(e, { isDeleted: true }) : e)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** The × and « Fermer l'orchestrateur »: a working orchestrator asks first (spec première version §5.4). */
export function requestCloseOrchestrator(orchestratorId: string) {
  const api = canvasStore.getState().api;
  if (!api || !isRunning(orchestratorId)) return removeOrchestrator(orchestratorId);
  const wires = orchestratorWires(api.getSceneElementsIncludingDeleted(), orchestratorId);
  uiStore.getState().setClosing({ agents: [orchestratorId], remove: [orchestratorId, ...wires] });
}

export function renameOrchestrator(orchestratorId: string, name: string) {
  nodesStore.getState().update(orchestratorId, { name: name.trim() || messages(nodesMessages).orchestrator.defaultName });
}
