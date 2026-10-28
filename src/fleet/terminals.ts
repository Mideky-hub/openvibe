import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { canvasStore } from "@/canvas/canvasStore";
import { groupInfoOf, groupOf, insertIntoFrame } from "@/canvas/groups";
import { allowRemoval } from "@/canvas/removalGuard";
import { createNodeElement, nodeKindOf } from "@/canvas/nodeElement";
import { markForAutostart } from "@/nodes/terminal/registry";
import type { TerminalPayload } from "@/nodes/types";
import { nodesStore, terminalOf } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { uiStore } from "@/store/ui";
import { cloneTerminalPayload } from "./clone";
import { arrangeInFrame, freeCell } from "./groupLayout";
import { nameForNewAgent } from "./naming";

export interface Point {
  x: number;
  y: number;
}

/**
 * Adds a terminal centered on `center` (scene coordinates), or in the first
 * free cell of the group `groupId` (spec habillage §11.3), and starts it when
 * shown.
 */
export async function addTerminal(
  workspaceId: string,
  payload: TerminalPayload,
  center: Point,
  groupId: string | null = null,
): Promise<string | null> {
  const api = canvasStore.getState().api;
  if (!api) return null;
  const element = createNodeElement("terminal", center);
  // The node row must exist before the process can save its scrollback.
  await nodesStore.getState().create(element.id, { workspaceId, kind: "terminal", payload });
  markForAutostart(element.id);
  // Read after the wait: the scene may have changed meanwhile.
  const elements = api.getSceneElementsIncludingDeleted();
  const frame = groupId ? elements.find((e) => e.id === groupId && !e.isDeleted && groupInfoOf(e)) : undefined;
  api.updateScene({
    elements: frame ? joinGroup(elements, element, frame) : [...elements, element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return element.id;
}

/** `elements` with `element` in the first free cell of `frame`, grown if it was full. */
function joinGroup(elements: readonly ExcalidrawElement[], element: ExcalidrawElement, frame: ExcalidrawElement) {
  const members = elements.filter((e) => !e.isDeleted && e.frameId === frame.id);
  const placed = freeCell(frame, members);
  return insertIntoFrame(
    elements,
    newElementWith(element, { x: placed.cell.x, y: placed.cell.y, frameId: frame.id }),
    newElementWith(frame, { width: placed.frame.width, height: placed.frame.height }),
  );
}

/** "Dupliquer" of the header: a copy of the agent to the right of the node, or in its group's grid. */
export async function duplicateTerminal(workspaceId: string, nodeId: string) {
  const element = canvasStore.getState().api?.getSceneElements().find((e) => e.id === nodeId);
  const source = terminalOf(nodesStore.getState().nodes[nodeId]);
  if (!element || !source) return;
  const group = groupOf(canvasStore.getState().frames, nodeId);
  const center = { x: element.x + element.width * 1.5 + 24, y: element.y + element.height / 2 };
  const name = await nameForNewAgent(workspaceId, group?.group.pantheon);
  await addTerminal(workspaceId, cloneTerminalPayload(source, name), center, group?.id ?? null);
}

/**
 * Gives terminal elements copied by Excalidraw (Ctrl+D, copy-paste) a node of
 * their own, then points their link at it. They start like any new agent.
 */
export async function adoptCopies(workspaceId: string, copies: readonly { id: string; sourceId: string }[]) {
  const api = canvasStore.getState().api;
  if (!api) return;
  for (const { id, sourceId } of copies) {
    const source = nodesStore.getState().nodes[sourceId];
    if (!source) continue;
    if (source.kind === "orchestrator") {
      // A copied orchestrator keeps its name; its session, created when shown, and its wires are its own.
      await nodesStore.getState().create(id, { workspaceId, kind: "orchestrator", payload: { name: source.payload.name } });
      continue;
    }
    if (source.kind === "kanban") {
      // A copied board starts with the same columns and cards, then lives on its own.
      await nodesStore.getState().create(id, { workspaceId, kind: "kanban", payload: structuredClone(source.payload) });
      continue;
    }
    markForAutostart(id);
    const frameId = api.getSceneElementsIncludingDeleted().find((e) => e.id === id)?.frameId;
    const group = canvasStore.getState().frames.find((f) => f.id === frameId);
    const name = await nameForNewAgent(workspaceId, group?.group?.pantheon);
    await nodesStore.getState().create(id, { workspaceId, kind: "terminal", payload: cloneTerminalPayload(source.payload, name) });
  }
  const ids = new Set(copies.map((copy) => copy.id));
  const linked = api
    .getSceneElementsIncludingDeleted()
    .map((e) => (ids.has(e.id) ? newElementWith(e, { link: `openvibe://${nodeKindOf(e) ?? "terminal"}/${e.id}` }) : e));
  api.updateScene({ elements: alignCopies(linked, ids), captureUpdate: CaptureUpdateAction.NEVER });
}

/** Copies made inside a group (Ctrl+D, copy-paste) take its first free cells too (spec §11.3). */
function alignCopies(elements: readonly ExcalidrawElement[], copyIds: ReadonlySet<string>): ExcalidrawElement[] {
  const byFrame = new Map<string, string[]>();
  for (const e of elements) {
    if (copyIds.has(e.id) && e.frameId && nodeKindOf(e) === "terminal") byFrame.set(e.frameId, [...(byFrame.get(e.frameId) ?? []), e.id]);
  }
  let result = [...elements];
  for (const [frameId, ids] of byFrame) {
    const frame = result.find((e) => e.id === frameId && !e.isDeleted);
    if (!frame || !groupInfoOf(frame)) continue;
    const members = result.filter((e) => !e.isDeleted && e.frameId === frameId && !copyIds.has(e.id));
    const placed = arrangeInFrame(frame, members, ids.length);
    const cells = new Map(ids.map((id, i) => [id, placed.cells[i]]));
    result = result.map((e) => {
      const cell = cells.get(e.id);
      if (cell) return newElementWith(e, { x: cell.x, y: cell.y });
      if (e.id === frameId) return newElementWith(e, { width: placed.frame.width, height: placed.frame.height });
      return e;
    });
  }
  return result;
}

/**
 * Deletes elements in one step, their closing confirmed or needing none: the
 * removal guard lets them go. Undo brings them back, stopped (spec V1 §8.5).
 */
export function removeNodes(ids: readonly string[]) {
  const api = canvasStore.getState().api;
  if (!api) return;
  allowRemoval(ids);
  const removed = new Set(ids);
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((e) => (removed.has(e.id) && !e.isDeleted ? newElementWith(e, { isDeleted: true }) : e)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

export function removeNode(nodeId: string) {
  removeNodes([nodeId]);
}

/** "Fermer" of the header: a running agent asks for confirmation first (spec habillage §7.5). */
export function requestClose(nodeId: string) {
  if (isRunning(nodeId)) uiStore.getState().setClosing({ agents: [nodeId], remove: [nodeId] });
  else removeNode(nodeId);
}
