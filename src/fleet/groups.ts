import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { canvasStore } from "@/canvas/canvasStore";
import { returnKeyboardToCanvas } from "@/canvas/keyboardFocus";
import { createGroupFrame, groupInfoOf, isGroup, withGroupFolded, withGroupSpeciality } from "@/canvas/groups";
import { allowRemoval } from "@/canvas/removalGuard";
import { createNodeElement } from "@/canvas/nodeElement";
import type { AgentId } from "@/ipc/pty";
import { newTerminalPayload } from "@/nodes/terminal/launch";
import { markForAutostart } from "@/nodes/terminal/registry";
import type { TerminalPayload } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { uiStore } from "@/store/ui";
import { workspacesStore } from "@/store/workspaces";
import { readableTargets } from "./groupView";
import { clearSpot, groupGrid } from "./groupLayout";
import { defaultLaunchOptions, type LaunchOptions } from "./launchAgent";
import { nextName } from "./names";
import { nameForNewAgent, namesInWorkspace, pantheonForNewGroup } from "./naming";
import { viewportCenter } from "./placement";
import { ROLES, type RoleId } from "./roles";
import { addTerminal, type Point } from "./terminals";
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
}

const withModel = (payload: TerminalPayload, model: string | undefined): TerminalPayload => (model ? { ...payload, model } : payload);

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
  const workspaceId = workspacesStore.getState().activeId;
  if (!api || !workspaceId || plan.agents.length === 0) return null;
  const pantheon = staffing?.pantheon ?? pantheonForNewGroup(workspaceId);
  const grid = groupGrid(plan.agents.length);
  const center = at ?? viewportCenter(view);
  const obstacles = api.getSceneElements().map(({ x, y, width, height }) => ({ x, y, width, height }));
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
      payload: withModel(newTerminalPayload({ ...options, cwd: staffing?.cwds[i] ?? options.cwd, agent }, agentName), staffing?.models?.[i]),
    });
    markForAutostart(node.id, i * LAUNCH_STAGGER_MS);
    terminals.push({ ...node, frameId: frame.id });
    nodeIds.push(node.id);
  }
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...terminals, frame],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  // 4 terminals fitted at once end up at 40 %, unreadable: the first ones are enough.
  const { width, height } = api.getAppState();
  api.scrollToContent(readableTargets(frame, terminals, { width, height }), {
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
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((e) => (e.id === groupId && groupInfoOf(e) ? newElementWith(e, { customData: withGroupFolded(e.customData, folded) }) : e)),
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
  const group = new Set(elements.filter((e) => !e.isDeleted && (e.id === groupId || e.frameId === groupId)).map((e) => e.id));
  const ends = (e: ExcalidrawElement) => (e.type === "arrow" ? [e.startBinding?.elementId, e.endBinding?.elementId] : []);
  const going = new Set(
    elements.filter((e) => !e.isDeleted && (group.has(e.id) || (isWire(e) && ends(e).some((id) => id !== undefined && group.has(id))))).map((e) => e.id),
  );
  allowRemoval(going);
  api.updateScene({
    elements: elements.map((e) => (going.has(e.id) ? newElementWith(e, { isDeleted: true }) : e)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  returnKeyboardToCanvas();
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
