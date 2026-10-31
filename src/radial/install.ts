import { canvasStore } from "@/canvas/canvasStore";
import { isGroup } from "@/canvas/groups";
import type { CommandContext } from "@/commands/command";
import { closeOpenMenus } from "@/commands/openMenus";
import { commandContext } from "@/commands/registry";
import { sceneOf } from "@/fleet/placement";
import type { Point } from "@/fleet/terminals";
import { isNativeMenu } from "./bridges";
import { chooseSlot } from "./choose";
import { isSlide, ringCenter, slideSlot } from "./gesture";
import { closeRadial, openRadial, radialStore, updateRadial } from "./radialState";
import type { RingKind } from "./rings";
import { domTarget, frameNameTarget, isTextField, sceneTarget } from "./target";

/** The canvas, a node or the name of a frame: where a right click is the ring's. */
function onCanvas(element: Element): boolean {
  return (
    element.closest('.excalidraw__embeddable-container, .excalidraw [id*="-frame-name-"]') !== null ||
    (element instanceof HTMLCanvasElement && element.classList.contains("interactive"))
  );
}

/** The ring a right press opens, and its context (spec menu radial §6.1, §6.4); null where it opens none. */
export function ringAt(element: Element, client: Point): { kind: RingKind; context: CommandContext } | null {
  const { api, view, frames } = canvasStore.getState();
  if (!api || !onCanvas(element) || isTextField(element)) return null;
  const at = sceneOf(client, view);
  const selection = api.getAppState().selectedElementIds;
  const selectedIds = Object.keys(selection).filter((id) => selection[id]);
  const groupIds = new Set(frames.filter(isGroup).map((f) => f.id));
  const target =
    domTarget(element) ?? frameNameTarget(element, groupIds) ?? sceneTarget({ point: at, zoom: view.zoom, elements: api.getSceneElements(), selectedIds, groupIds });
  const context: CommandContext = { ...commandContext(), at };
  switch (target.kind) {
    case "terminal":
      return { kind: "terminal", context: { ...context, terminalId: target.id } };
    case "orchestrator":
      return { kind: "orchestrator", context: { ...context, orchestratorId: target.id } };
    case "group":
      return { kind: "group", context: { ...context, groupId: target.id } };
    case "selection": {
      // As Excalidraw does: a drawing outside the selection becomes the selection; the keys go to the canvas.
      const same = target.ids.length === selectedIds.length && target.ids.every((id) => selection[id]);
      if (same) api.updateScene({ appState: { activeEmbeddable: null } });
      else {
        const selectedGroupIds = target.groupId ? { [target.groupId]: true } : {};
        api.updateScene({ appState: { selectedElementIds: Object.fromEntries(target.ids.map((id) => [id, true])), selectedGroupIds, activeEmbeddable: null } });
      }
      return { kind: "selection", context };
    }
    default:
      return { kind: "canvas", context };
  }
}

/** The right click opens the ring; the native menu never opens unasked (spec menu radial §5.2). */
export function installRadial(win: Window): () => void {
  // The contextmenu that follows a right release the ring handled: closed by a
  // slide, the ring no longer covers it, and over the UI WebView2 would show its own.
  let swallowMenu = false;
  const onPointerDown = (event: PointerEvent) => {
    swallowMenu = false;
    const { ring } = radialStore.getState();
    const element = event.target instanceof Element ? event.target : null;
    if (event.button === 2 && element) {
      const client = { x: event.clientX, y: event.clientY };
      const opened = ringAt(element, client);
      if (!opened) {
        if (ring) closeRadial();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // The press is stopped here: the other menus' click-outside listeners never see it.
      closeOpenMenus(win.document);
      canvasStore.getState().api?.updateScene({ appState: { contextMenu: null } });
      const center = ringCenter(client, { width: win.innerWidth, height: win.innerHeight });
      openRadial({ ...opened, client, center, pressed: true, sliding: false, hovered: null });
      return;
    }
    if (ring && !element?.closest("[data-radial]")) closeRadial();
  };
  const onPointerMove = (event: PointerEvent) => {
    const { ring } = radialStore.getState();
    if (!ring?.pressed) return;
    const pointer = { x: event.clientX, y: event.clientY };
    if (!ring.sliding && !isSlide(ring.client, pointer)) return;
    updateRadial({ sliding: true, hovered: slideSlot(ring.center, ring.client, pointer) });
  };
  const onPointerUp = (event: PointerEvent) => {
    const { ring } = radialStore.getState();
    if (event.button !== 2 || !ring?.pressed) return;
    event.preventDefault();
    event.stopPropagation();
    swallowMenu = true;
    if (!ring.sliding) updateRadial({ pressed: false });
    else if (ring.hovered === null) closeRadial();
    else chooseSlot(ring.hovered);
  };
  const onContextMenu = (event: MouseEvent) => {
    if (isNativeMenu(event)) return;
    const element = event.target instanceof Element ? event.target : null;
    const swallow = swallowMenu;
    swallowMenu = false;
    if (swallow || radialStore.getState().ring || (element && onCanvas(element) && !isTextField(element))) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !radialStore.getState().ring) return;
    event.preventDefault();
    event.stopPropagation();
    closeRadial();
  };
  const onWheel = () => {
    if (radialStore.getState().ring) closeRadial();
  };
  const listeners: [string, EventListener][] = [
    ["pointerdown", onPointerDown as EventListener],
    ["pointermove", onPointerMove as EventListener],
    ["pointerup", onPointerUp as EventListener],
    ["contextmenu", onContextMenu as EventListener],
    ["keydown", onKeyDown as EventListener],
    ["wheel", onWheel],
  ];
  for (const [type, listener] of listeners) win.addEventListener(type, listener, true);
  return () => {
    for (const [type, listener] of listeners) win.removeEventListener(type, listener, true);
  };
}
