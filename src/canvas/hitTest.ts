import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { nodeKindOf } from "./nodeElement";

/**
 * Topmost live terminal node containing the scene point, or null. Later elements
 * are drawn above earlier ones, so the array is searched from the end. Rotation
 * is ignored: nodes are never rotated in practice.
 */
export function findTerminalAt(elements: readonly ExcalidrawElement[], x: number, y: number): ExcalidrawElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    // A locked terminal is one a folded group keeps hidden.
    if (element.isDeleted || element.locked || nodeKindOf(element) !== "terminal") continue;
    const inside = x >= element.x && x <= element.x + element.width && y >= element.y && y <= element.y + element.height;
    if (inside) return element;
  }
  return null;
}
