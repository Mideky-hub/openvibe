import { createStore, useStore } from "zustand";
import type { AppState, ExcalidrawImperativeAPI, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import { sameLinks, type Links } from "@/fleet/wires";
import { sameFrames, type Rect, type SceneFrame } from "./groups";

/** The part of Excalidraw's state that the shell around the canvas shows. */
export interface CanvasView {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  /** Excalidraw's active tool type ("selection", "rectangle", "freedraw"…). */
  tool: string;
  selectedIds: string[];
  /** The frame whose name Excalidraw is editing (its group label hides meanwhile). */
  editingFrame: string | null;
  /** Alt+Z hides the tools, Alt+R makes the canvas read-only: either needs a visible way out. */
  mode: "zen" | "reading" | null;
}

export const EMPTY_VIEW: CanvasView = {
  scrollX: 0,
  scrollY: 0,
  zoom: 1,
  width: 0,
  height: 0,
  offsetLeft: 0,
  offsetTop: 0,
  tool: "selection",
  selectedIds: [],
  editingFrame: null,
  mode: null,
};

export function viewFrom(appState: AppState): CanvasView {
  return {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom.value,
    width: appState.width,
    height: appState.height,
    offsetLeft: appState.offsetLeft,
    offsetTop: appState.offsetTop,
    tool: appState.activeTool.type,
    selectedIds: Object.keys(appState.selectedElementIds)
      .filter((id) => appState.selectedElementIds[id])
      .sort(),
    editingFrame: appState.editingFrame ?? null,
    mode: appState.viewModeEnabled ? "reading" : appState.zenModeEnabled ? "zen" : null,
  };
}

/**
 * The view that shows an element at 100 %, centered. Set in one `updateScene`:
 * `scrollToContent` right after a zoom change keeps the zoom it read before it.
 */
export function fullSizeView(
  element: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
) {
  return {
    zoom: { value: 1 as NormalizedZoomValue },
    scrollX: viewport.width / 2 - (element.x + element.width / 2),
    scrollY: viewport.height / 2 - (element.y + element.height / 2),
  };
}

export function sameView(a: CanvasView, b: CanvasView): boolean {
  return (
    a.scrollX === b.scrollX &&
    a.scrollY === b.scrollY &&
    a.zoom === b.zoom &&
    a.width === b.width &&
    a.height === b.height &&
    a.offsetLeft === b.offsetLeft &&
    a.offsetTop === b.offsetTop &&
    a.tool === b.tool &&
    a.editingFrame === b.editingFrame &&
    a.mode === b.mode &&
    a.selectedIds.length === b.selectedIds.length &&
    a.selectedIds.every((id, i) => id === b.selectedIds[i])
  );
}

interface CanvasState {
  /** The Excalidraw instance of the workspace on screen. */
  api: ExcalidrawImperativeAPI | null;
  view: CanvasView;
  setApi: (api: ExcalidrawImperativeAPI | null) => void;
  /** Called on every Excalidraw onChange; listeners only hear real changes. */
  setView: (view: CanvasView) => void;
  /** Frames and groups of the scene on screen, derived on every change (spec §11.1). */
  frames: SceneFrame[];
  setFrames: (frames: SceneFrame[]) => void;
  /** Ids of the OpenVibe nodes on the canvas on screen (deleted ones excluded). */
  nodeIds: string[];
  setNodeIds: (ids: string[]) => void;
  /** What each orchestrator of the scene is wired to (spec habillage §13). */
  links: Record<string, Links>;
  setLinks: (links: Record<string, Links>) => void;
  /** The scene rectangle of each node: where the overlays anchor (spec orchestrateur §5.1). */
  nodeRects: Record<string, Rect>;
  setNodeRects: (rects: Record<string, Rect>) => void;
}

export const canvasStore = createStore<CanvasState>()((set, get) => ({
  api: null,
  view: EMPTY_VIEW,
  setApi: (api) => set({ api }),
  setView: (view) => {
    if (!sameView(get().view, view)) set({ view });
  },
  frames: [],
  setFrames: (frames) => {
    if (!sameFrames(get().frames, frames)) set({ frames });
  },
  nodeIds: [],
  setNodeIds: (ids) => {
    const current = get().nodeIds;
    if (ids.length !== current.length || ids.some((id, i) => id !== current[i])) set({ nodeIds: ids });
  },
  nodeRects: {},
  setNodeRects: (rects) => {
    const current = get().nodeRects;
    const ids = Object.keys(rects);
    const same =
      ids.length === Object.keys(current).length &&
      ids.every((id) => {
        const a = rects[id];
        const b = current[id];
        return b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
      });
    if (!same) set({ nodeRects: rects });
  },
  links: {},
  setLinks: (links) => {
    if (!sameLinks(get().links, links)) set({ links });
  },
}));

export function useCanvas<T>(selector: (state: CanvasState) => T): T {
  return useStore(canvasStore, selector);
}
