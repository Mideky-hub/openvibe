import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { canvasStore } from "@/canvas/canvasStore";
import { returnKeyboardToCanvas } from "@/canvas/keyboardFocus";
import { createGroupFrame, groupInfoOf, isGroup, withGroupFolded, withGroupSpeciality } from "@/canvas/groups";
import { allowRemoval } from "@/canvas/removalGuard";
import { createNodeElement, nodeKindOf } from "@/canvas/nodeElement";
import type { AgentId, Permission } from "@/ipc/pty";
import { newTerminalPayload } from "@/nodes/terminal/launch";
import { markForAutostart, relaunchTerminal } from "@/nodes/terminal/registry";
import type { TerminalPayload } from "@/nodes/types";
import { nodesStore, terminalOf } from "@/store/nodes";
import { messages } from "@/i18n";
import { fleetMessages } from "./messages";
import { isRunning, statusOf } from "@/store/terminalStatus";
import { toast } from "sonner";
import { uiStore } from "@/store/ui";
import { workspacesStore } from "@/store/workspaces";
import { readableTargets } from "./groupView";
import { clearSpot, groupGrid } from "./groupLayout";
import { defaultLaunchOptions, type LaunchOptions } from "./launchAgent";
import { nextName } from "./names";
import { nameForNewAgent, namesInWorkspace, pantheonForNewGroup } from "./naming";
import { viewportCenter } from "./placement";
import { ROLES, type RoleId } from "./roles";
import { sceneAccess } from "./sceneAccess";
import { addTerminal, removeFromStoredScene, type Point } from "./terminals";
import { isWire } from "./wires";

export interface GroupPlan {
  name: string;
  role: RoleId;
  agents: AgentId[];
}

/** Who staffs a mission's group: its pantheon, its agents' names and folders (spec orchestrateur §7.3). */
export interface GroupStaffing {
  pantheon: string;
  names: readonly string[];
  cwds: readonly string[];
  /** Claude's model of each agent, chosen by a mission's router (spec maj §3). */
  models?: readonly (string | undefined)[];
  /** What its mission lets them do unasked (spec mission de nuit §5.3). */
  permission?: Permission;
  /** The orchestrator's workspace, on screen or not (spec mission de nuit §6.1). */
  workspaceId?: string;
}

const withModel = (payload: TerminalPayload, model: string | undefined): TerminalPayload => (model ? { ...payload, model } : payload);
const withPermission = (payload: TerminalPayload, permission: Permission | undefined): TerminalPayload => (permission ? { ...payload, permission } : payload);

/** Long enough for a render: a timer, since frames stop while the window is minimized. */
const MOUNT_MS = 100;

/** Time between two agents of a new group starting (spec habillage §20). */
export const LAUNCH_STAGGER_MS = 300;

/**
 * Creates a group around `at`, else the view's center — its frame and terminals in one
 * scene update, so one undo removes it — then shows it whole and starts its
 * agents one by one (spec habillage §11.3).
 */
export async function launchGroup(
  plan: GroupPlan,
  options: LaunchOptions = defaultLaunchOptions(),
  at?: Point,
  staffing?: GroupStaffing,
): Promise<{ frameId: string; nodeIds: string[] } | null> {
  const { api, view } = canvasStore.getState();
  const workspaceId = staffing?.workspaceId ?? workspacesStore.getState().activeId;
  const first = workspaceId ? sceneAccess(workspaceId) : null;
  if (!first || !workspaceId || plan.agents.length === 0) return null;
  const pantheon = staffing?.pantheon ?? pantheonForNewGroup(workspaceId);
  const grid = groupGrid(plan.agents.length);
  const center = at ?? viewportCenter(view);
  const obstacles = first.elements().filter((e) => !e.isDeleted).map(({ x, y, width, height }) => ({ x, y, width, height }));
  const origin = clearSpot(
    { x: center.x - grid.width / 2, y: center.y - grid.height / 2, width: grid.width, height: grid.height },
    obstacles,
  );
  const name = plan.name.trim() || ROLES[plan.role].label;
  const frame = createGroupFrame({ ...origin, width: grid.width, height: grid.height }, name, { role: plan.role, pantheon });
  const taken = namesInWorkspace(workspaceId);
  const terminals: ExcalidrawElement[] = [];
  const nodeIds: string[] = [];
  for (const [i, agent] of plan.agents.entries()) {
    const cell = grid.cells[i];
    const node = createNodeElement("terminal", { x: origin.x + cell.x + cell.width / 2, y: origin.y + cell.y + cell.height / 2 });
    const agentName = staffing?.names[i] ?? nextName(pantheon, taken);
    taken.push(agentName);
    await nodesStore.getState().create(node.id, {
      workspaceId,
      kind: "terminal",
      payload: withPermission(withModel(newTerminalPayload({ ...options, cwd: staffing?.cwds[i] ?? options.cwd, agent }, agentName), staffing?.models?.[i]), staffing?.permission),
    });
    markForAutostart(node.id, i * LAUNCH_STAGGER_MS);
    terminals.push({ ...node, frameId: frame.id });
    nodeIds.push(node.id);
  }
  // Read after the waits: the user may have left the workspace or come back to it.
  const scene = sceneAccess(workspaceId);
  if (!scene) return null;
  scene.write([...scene.elements(), ...terminals, frame]);
  if (!scene.shown || !api) {
    // Nothing mounts a terminal out of sight (spec mission de nuit §6.1).
    for (const id of nodeIds) {
      const payload = terminalOf(nodesStore.getState().nodes[id]);
      if (payload) void relaunchTerminal(id, payload, "new");
    }
    return { frameId: frame.id, nodeIds };
  }
  const { width, height } = api.getAppState();
  const targets = readableTargets(frame, terminals, { width, height });
  // Excalidraw mounts a terminal once it was in view, and it starts there: the
  // whole group first. Read before the caller frames anything of its own.
  if (!targets.includes(frame)) {
    api.scrollToContent([frame], { fitToViewport: true, viewportZoomFactor: 0.9, animate: false, maxZoom: 1 });
    await new Promise((resolve) => setTimeout(resolve, MOUNT_MS));
  }
  // 4 terminals fitted at once end up at 40 %, unreadable: the first ones are enough.
  api.scrollToContent(targets, {
    fitToViewport: true,
    viewportZoomFactor: 0.9,
    animate: true,
    duration: 300,
    maxZoom: 1,
  });
  return { frameId: frame.id, nodeIds };
}

/** "Ajouter un agent" of the group menu: the group's first free cell (spec §11.4). */
export async function addAgentToGroup(groupId: string, agent: AgentId) {
  const workspaceId = workspacesStore.getState().activeId;
  const group = canvasStore.getState().frames.find((f) => f.id === groupId);
  if (!workspaceId || !group || !isGroup(group)) return;
  // A new agent in a folded group would stay off the screen, and so would not start.
  if (group.group.folded) setGroupFolded(groupId, false);
  const name = await nameForNewAgent(workspaceId, group.group.pantheon);
  const center = { x: group.x + group.width / 2, y: group.y + group.height / 2 };
  await addTerminal(workspaceId, newTerminalPayload({ ...defaultLaunchOptions(), agent }, name), center, groupId);
}

/**
 * Renames a group as one undoable step (see `groupBeingRenamed` for why the
 * label's editor is used rather than Excalidraw's). An empty name is ignored.
 */
export function renameGroup(groupId: string, name: string) {
  const api = canvasStore.getState().api;
  const trimmed = name.trim();
  if (!api || !trimmed) return;
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((e) => (e.id === groupId && e.type === "frame" && e.name !== trimmed ? newElementWith(e, { name: trimmed }) : e)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** Gives a group its speciality, or takes it away when blank, as one undoable step (spec groupes spécialisés §2). */
export function setGroupSpeciality(groupId: string, speciality: string) {
  const api = canvasStore.getState().api;
  if (!api) return;
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((e) => (e.id === groupId && groupInfoOf(e) ? newElementWith(e, { customData: withGroupSpeciality(e.customData, speciality) }) : e)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** Folds a group onto its label, or unfolds it: one undoable step, nothing stops (spec replier un groupe). */
export function setGroupFolded(groupId: string, folded: boolean) {
  const api = canvasStore.getState().api;
  if (!api) return;
  // A hidden agent is not mounted, so it never starts: wait for the ones still waiting for their turn.
  const waiting = canvasStore.getState().frames.find((f) => f.id === groupId)?.memberIds.some((id) => statusOf(id).state === "starting");
  if (folded && waiting) {
    toast.error(messages(fleetMessages).foldWaiting);
    return;
  }
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((e) => {
        if (e.id === groupId && groupInfoOf(e)) return newElementWith(e, { customData: withGroupFolded(e.customData, folded) });
        // Locked while folded: a click on a hidden agent's empty cell can neither select, move nor delete it.
        if (e.frameId === groupId && nodeKindOf(e) === "terminal") return newElementWith(e, { locked: folded });
        return e;
      }),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/** Frames these groups whole: an agent out of sight does not start (spec groupes spécialisés §4). */
export function showGroups(groupIds: readonly string[]) {
  const api = canvasStore.getState().api;
  const frames = api?.getSceneElements().filter((e) => groupIds.includes(e.id)) ?? [];
  if (frames.length > 0) api?.scrollToContent(frames, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true, duration: 300, maxZoom: 1 });
}

/** "Dégrouper": the frame goes, its terminals stay where they are (spec §11.4). */
export function ungroup(groupId: string) {
  const api = canvasStore.getState().api;
  if (!api) return;
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((e) => {
      if (e.id === groupId) return newElementWith(e, { isDeleted: true });
      if (e.frameId === groupId) return newElementWith(e, { frameId: null });
      return e;
    }),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  returnKeyboardToCanvas();
}

/**
 * "Fermer le groupe", confirmed: the frame, its terminals and the wires that
 * led to them go (no arrow left bound to nothing, final review H2); one undo
 * brings them back, stopped.
 */
export function closeGroup(groupId: string) {
  const api = canvasStore.getState().api;
  if (!api) return;
  const elements = api.getSceneElementsIncludingDeleted();
  const going = goingWithGroup(elements, groupId);
  allowRemoval(going);
  api.updateScene({
    elements: elements.map((e) => (going.has(e.id) ? newElementWith(e, { isDeleted: true }) : e)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  returnKeyboardToCanvas();
}

/** A group, its terminals and the wires that led to them. */
function goingWithGroup(elements: readonly ExcalidrawElement[], groupId: string): Set<string> {
  const group = new Set(elements.filter((e) => !e.isDeleted && (e.id === groupId || e.frameId === groupId)).map((e) => e.id));
  const ends = (e: ExcalidrawElement) => (e.type === "arrow" ? [e.startBinding?.elementId, e.endBinding?.elementId] : []);
  return new Set(
    elements.filter((e) => !e.isDeleted && (group.has(e.id) || (isWire(e) && ends(e).some((id) => id !== undefined && group.has(id))))).map((e) => e.id),
  );
}

/** Closes a group in a scene not on screen (spec mission de nuit §6.1). */
export function closeStoredGroup(workspaceId: string, groupId: string) {
  const scene = sceneAccess(workspaceId);
  if (scene && !scene.shown) removeFromStoredScene(workspaceId, goingWithGroup(scene.elements(), groupId));
}

/** Asks first when agents of the group are still running (spec §11.4). */
export function requestCloseGroup(groupId: string) {
  const group = canvasStore.getState().frames.find((f) => f.id === groupId);
  if (group?.memberIds.some(isRunning)) uiStore.getState().setClosingGroup(groupId);
  else closeGroup(groupId);
}

/** The terminals of a group, for its menu's pause and resume. */
export function groupMembers(groupId: string): string[] {
  return canvasStore.getState().frames.find((f) => f.id === groupId)?.memberIds ?? [];
}
