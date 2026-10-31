import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { orphanWires, revivableWires, unmarkedWires } from "./wires";

/** An upkeep is already programmed for the next frame: further changes wait for it, not queue behind it. */
let pending = false;

/**
 * Hand-drawn wires get their mark and wires left without an end go (spec
 * habillage §13, plan B3), outside the undo history, a frame after the
 * change: changing the scene from inside `onChange` would re-enter it. One
 * upkeep at a time, each reading the scene as it is then.
 */
export function scheduleWireUpkeep(api: ExcalidrawImperativeAPI, elements: readonly ExcalidrawElement[]) {
  if (pending || (unmarkedWires(elements).length === 0 && orphanWires(elements).length === 0 && revivableWires(elements).length === 0)) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const current = api.getSceneElementsIncludingDeleted();
    const marked = new Set(unmarkedWires(current));
    const orphans = new Set(orphanWires(current));
    const revived = new Set(revivableWires(current));
    if (marked.size === 0 && orphans.size === 0 && revived.size === 0) return;
    api.updateScene({
      elements: current.map((e) => {
        // Marked, so that an undo bringing its ends back brings the wire back too.
        if (orphans.has(e.id)) return newElementWith(e, { isDeleted: true, customData: { ...e.customData, openvibe: { kind: "wire", orphaned: true } } });
        if (revived.has(e.id)) return newElementWith(e, { isDeleted: false, customData: { ...e.customData, openvibe: { kind: "wire" } } });
        if (marked.has(e.id)) return newElementWith(e, { customData: { ...e.customData, openvibe: { kind: "wire" } } });
        return e;
      }),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  });
}
