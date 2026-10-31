import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { nodeKindOf } from "@/canvas/nodeElement";
import type { Point } from "@/fleet/terminals";

/** What a right press points at (spec menu radial §6.4). */
export type RadialTarget =
  | { kind: "canvas" }
  | { kind: "terminal"; id: string }
  | { kind: "orchestrator"; id: string }
  | { kind: "group"; id: string }
  | { kind: "selection"; ids: string[]; groupId?: string };

/** A text field keeps its own right click (§5.2); xterm's hidden input is not one. */
export function isTextField(element: Element): boolean {
  if (element.closest(".xterm")) return false;
  return element.closest("input, textarea, [contenteditable='true'], [contenteditable='']") !== null;
}

/** A node's body, read from the page; null elsewhere. */
export function domTarget(element: Element): RadialTarget | null {
  const terminal = element.closest("[data-terminal]")?.getAttribute("data-terminal");
  if (terminal) return { kind: "terminal", id: terminal };
  const orchestrator = element.closest("[data-orchestrator]")?.getAttribute("data-orchestrator");
  if (orchestrator) return { kind: "orchestrator", id: orchestrator };
  return null;
}

const FRAME_NAME = "-frame-name-";

/** Excalidraw's name of a frame, drawn in the page above it: a group's label, else the frame itself. */
export function frameNameTarget(element: Element, groupIds: ReadonlySet<string>): RadialTarget | null {
  const name = element.closest(`.excalidraw [id*="${FRAME_NAME}"]`);
  if (!name) return null;
  const id = name.id.slice(name.id.indexOf(FRAME_NAME) + FRAME_NAME.length);
  return groupIds.has(id) ? { kind: "group", id } : { kind: "selection", ids: [id] };
}

export interface ScenePick {
  /** The press, in scene coordinates. */
  point: Point;
  zoom: number;
  /** Live elements, bottom to top. */
  elements: readonly ExcalidrawElement[];
  selectedIds: readonly string[];
  /** Frames that are OpenVibe groups. */
  groupIds: ReadonlySet<string>;
}

/** Screen pixels around a stroke or an outline that still count as on it. */
const TOLERANCE = 6;
/** The band above a group's frame where its label sits (canvas/overlay/GroupLabels.tsx). */
const LABEL_HEIGHT = 24;

/**
 * The box Excalidraw turns an element around: its own, except for a line or an
 * arrow, whose points may go left of or above (x, y).
 */
function boxOf(element: ExcalidrawElement) {
  if ((element.type === "line" || element.type === "arrow") && "points" in element && element.points.length > 0) {
    const xs = element.points.map(([x]) => x);
    const ys = element.points.map(([, y]) => y);
    const x = element.x + Math.min(...xs);
    const y = element.y + Math.min(...ys);
    return { x, y, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

/** `point` in the element's own axes: Excalidraw turns an element around its center. */
function unturned(element: ExcalidrawElement, point: Point): Point {
  const box = boxOf(element);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cos = Math.cos(-element.angle);
  const sin = Math.sin(-element.angle);
  const dx = point.x - cx;
  const dy = point.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

function hits(element: ExcalidrawElement, point: Point, tolerance: number): boolean {
  const p = unturned(element, point);
  if ((element.type === "line" || element.type === "arrow" || element.type === "freedraw") && "points" in element) {
    const reach = tolerance + element.strokeWidth / 2;
    const points = element.points.map(([x, y]) => ({ x: element.x + x, y: element.y + y }));
    if (points.length === 1) return Math.hypot(p.x - points[0].x, p.y - points[0].y) <= reach;
    return points.slice(1).some((b, i) => distanceToSegment(p, points[i], b) <= reach);
  }
  const box = boxOf(element);
  return p.x >= box.x - tolerance && p.x <= box.x + box.width + tolerance && p.y >= box.y - tolerance && p.y <= box.y + box.height + tolerance;
}

/** The box around elements, turned ones included. */
function boundsOf(elements: readonly ExcalidrawElement[]) {
  const corners = elements.flatMap((element) => {
    const e = boxOf(element);
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;
    const cos = Math.cos(element.angle);
    const sin = Math.sin(element.angle);
    return [
      [e.x, e.y],
      [e.x + e.width, e.y],
      [e.x, e.y + e.height],
      [e.x + e.width, e.y + e.height],
    ].map(([x, y]) => ({ x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos }));
  });
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** As Excalidraw's own right click: a box for its label, a group of drawings whole (its outermost group). */
function drawingAt(element: ExcalidrawElement, elements: readonly ExcalidrawElement[]): RadialTarget {
  const container = "containerId" in element && element.containerId ? elements.find((e) => e.id === element.containerId) : undefined;
  const hit = container ?? element;
  const groupId = hit.groupIds[hit.groupIds.length - 1];
  if (!groupId) return { kind: "selection", ids: [hit.id] };
  return { kind: "selection", ids: elements.filter((e) => e.groupIds.includes(groupId)).map((e) => e.id), groupId };
}

/** What the scene has under a press (§6.4, steps 3 to 6). */
export function sceneTarget({ point, zoom, elements, selectedIds, groupIds }: ScenePick): RadialTarget {
  const tolerance = TOLERANCE / zoom;
  const selected = elements.filter((e) => selectedIds.includes(e.id));
  const loneNode = selected.length === 1 && nodeKindOf(selected[0]) !== null;
  if (selected.length > 0 && !loneNode) {
    const box = boundsOf(selected);
    if (point.x >= box.x1 - tolerance && point.x <= box.x2 + tolerance && point.y >= box.y1 - tolerance && point.y <= box.y2 + tolerance) {
      return { kind: "selection", ids: selected.map((e) => e.id) };
    }
  }
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (element.type === "frame" || element.type === "magicframe" || !hits(element, point, tolerance)) continue;
    const kind = nodeKindOf(element);
    if (kind === "terminal" || kind === "orchestrator") return { kind, id: element.id };
    return drawingAt(element, elements);
  }
  for (let i = elements.length - 1; i >= 0; i--) {
    const frame = elements[i];
    if (frame.type !== "frame") continue;
    const group = groupIds.has(frame.id);
    const top = frame.y - (group ? LABEL_HEIGHT / zoom : 0);
    if (point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= top && point.y <= frame.y + frame.height) {
      return group ? { kind: "group", id: frame.id } : { kind: "selection", ids: [frame.id] };
    }
  }
  return { kind: "canvas" };
}
