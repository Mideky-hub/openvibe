import type { NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { focusTerminal } from "@/nodes/terminal/registry";
import { BOTTOM_BAR_HEIGHT, TOP_ROW_HEIGHT } from "@/shell/layout";
import { signalArrival } from "./arrivalSignal";
import { canvasStore } from "./canvasStore";
import { terminalWithKeyboard } from "./keyboardFocus";
import { nodeKindOf, type NodeKind } from "./nodeElement";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
}

/**
 * The view stays when the terminal shows whole, at 100 %, in the zone utile:
 * the canvas less the bars at the top and the command bar's band at the
 * bottom (spec fenêtre §6.4, as amended by spec identité §7).
 */
export function needsMove(rect: Rect, view: Viewport): boolean {
  if (view.zoom !== 1) return true;
  const left = rect.x + view.scrollX;
  const top = rect.y + view.scrollY;
  return left < 0 || top < TOP_ROW_HEIGHT || left + rect.width > view.width || top + rect.height > view.height - BOTTOM_BAR_HEIGHT;
}

/** The waiting notice would hide part of the node: an agent's question sits at the bottom of its terminal (spec notification §4). */
function underWaitingNotice(rect: Rect, view: Viewport): boolean {
  const notice = document.querySelector("[data-waiting-notice]")?.getBoundingClientRect();
  if (!notice) return false;
  const left = rect.x + view.scrollX;
  const top = rect.y + view.scrollY;
  return left < notice.right && left + rect.width > notice.left && top < notice.bottom && top + rect.height > notice.top;
}

/** The terminal at 100 %, centered in the zone utile (plan E1, décision 1). */
export function arrivalView(rect: Rect, viewport: { width: number; height: number }) {
  const middle = (TOP_ROW_HEIGHT + viewport.height - BOTTOM_BAR_HEIGHT) / 2;
  return {
    zoom: { value: 1 as NormalizedZoomValue },
    scrollX: viewport.width / 2 - (rect.x + rect.width / 2),
    scrollY: middle - (rect.y + rect.height / 2),
  };
}

/** How many frames (about two seconds) the keyboard is offered to an arriving node: after a workspace switch its terminal mounts late (plan E1, J8). */
export const FOCUS_FRAMES = 120;

/**
 * Offers the keyboard on each of the next frames until `focus` succeeds:
 * Excalidraw shows a node that was off screen once the view has moved, and
 * after a workspace switch its terminal may only be mounted a frame later.
 */
function focusSoon(focus: () => boolean, token: number, frames = FOCUS_FRAMES) {
  requestAnimationFrame(() => {
    // A newer arrival owns the keyboard: its loop replaces this one.
    if (token !== generation) return;
    if (!focus() && frames > 1) focusSoon(focus, token, frames - 1);
    else arriving = null;
  });
}

let generation = 0;
let arriving: string | null = null;

/** The node an arrival is still giving the keyboard to: a Ctrl+Tab repeat steps on from it, not from the terminal left (plan E1). */
export function arrivingNode(): string | null {
  return arriving;
}

/** Gives the keyboard to the xterm of a terminal or of an orchestrator's session. */
function focusNodeInput(nodeId: string, kind: NodeKind | null): boolean {
  focusTerminal(nodeId);
  if (kind === "orchestrator") return document.activeElement?.closest(`[data-orchestrator="${nodeId}"]`) != null;
  return terminalWithKeyboard() === nodeId;
}

/**
 * Arrival on a node (spec fenêtre §6.4, §7.2), shared by Ctrl+Tab and Ctrl+P:
 * the view moves only if needed; the node is activated as by a click in its
 * body, without selecting it, and the selection left behind is cleared: the
 * canvas keys (Suppr, arrows) must not act on a node out of sight. A terminal
 * takes the keyboard and flashes; an orchestrator gets the cursor in its
 * field. False when the node is not on the canvas.
 */
export function arrive(nodeId: string): boolean {
  const api = canvasStore.getState().api;
  const element = api?.getSceneElements().find((e) => e.id === nodeId);
  if (!api || !element) return false;
  // A folded group keeps its terminals off the screen: unfold it, then arrive (spec replier un groupe §2).
  const folded = canvasStore.getState().frames.find((f) => f.group?.folded && f.memberIds.includes(nodeId));
  if (folded) {
    void import("@/fleet/groups").then(({ setGroupFolded }) => {
      setGroupFolded(folded.id, false);
      setTimeout(() => arrive(nodeId), 0);
    });
    return true;
  }
  const app = api.getAppState();
  const view = { scrollX: app.scrollX, scrollY: app.scrollY, zoom: app.zoom.value, width: app.width, height: app.height };
  const move = needsMove(element, view) || underWaitingNotice(element, view) ? arrivalView(element, view) : {};
  api.updateScene({
    appState: { ...move, activeEmbeddable: { element, state: "active" }, selectedElementIds: {}, selectedGroupIds: {} },
  });
  const kind = nodeKindOf(element);
  generation += 1;
  arriving = nodeId;
  focusSoon(() => focusNodeInput(nodeId, kind), generation);
  if (kind === "terminal") signalArrival(nodeId);
  return true;
}

/** Brings a node whole into the zone utile at 100 % if it is not, without activating it or taking the keyboard. False when it is gone. */
export function showNode(nodeId: string): boolean {
  const api = canvasStore.getState().api;
  const element = api?.getSceneElements().find((e) => e.id === nodeId);
  if (!api || !element) return false;
  const app = api.getAppState();
  const view = { scrollX: app.scrollX, scrollY: app.scrollY, zoom: app.zoom.value, width: app.width, height: app.height };
  if (needsMove(element, view)) api.updateScene({ appState: arrivalView(element, view) });
  return true;
}

/**
 * Scrolls to a node added out of sight (Excalidraw mounts a node, and so
 * starts its agent, only once it is shown), at the zoom the view has. A node
 * in sight, even partly, leaves the view alone. False when it is gone.
 */
export function revealNode(nodeId: string): boolean {
  const api = canvasStore.getState().api;
  const element = api?.getSceneElements().find((e) => e.id === nodeId);
  if (!api || !element) return false;
  const app = api.getAppState();
  const zoom = app.zoom.value;
  const left = (element.x + app.scrollX) * zoom;
  const top = (element.y + app.scrollY) * zoom;
  const inSight = left + element.width * zoom > 0 && left < app.width && top + element.height * zoom > TOP_ROW_HEIGHT && top < app.height - BOTTOM_BAR_HEIGHT;
  if (!inSight) api.scrollToContent(element, { animate: true, canvasOffsets: { top: TOP_ROW_HEIGHT, bottom: BOTTOM_BAR_HEIGHT } });
  return true;
}
