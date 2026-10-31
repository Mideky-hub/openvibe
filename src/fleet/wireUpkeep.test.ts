import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createGroupFrame } from "@/canvas/groups";
import { createNodeElement } from "@/canvas/nodeElement";
import { scheduleWireUpkeep } from "./wireUpkeep";
import { createWire, withWire } from "./wires";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "never" },
  newElementWith: (e: object, fields: object) => ({ ...e, ...fields }),
}));

const orchestrator = createNodeElement("orchestrator", { x: 0, y: 0 }) as unknown as ExcalidrawElement;
const frame = createGroupFrame({ x: 600, y: 0, width: 900, height: 600 }, "B", { role: "backend", pantheon: "greek" }) as ExcalidrawElement;
const lone = createNodeElement("terminal", { x: 0, y: 900 }) as unknown as ExcalidrawElement;
const hand = { ...createWire(orchestrator, lone), customData: undefined } as ExcalidrawElement;

let frames: FrameRequestCallback[];
const updateScene = vi.fn();
const api = (elements: ExcalidrawElement[]) =>
  ({ getSceneElementsIncludingDeleted: () => elements, updateScene }) as unknown as ExcalidrawImperativeAPI;

beforeEach(() => {
  frames = [];
  updateScene.mockClear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
});
afterEach(() => vi.unstubAllGlobals());

it("marks a hand-drawn wire once, however many changes come before the frame (plan B3)", () => {
  const elements = [orchestrator, lone, hand];
  scheduleWireUpkeep(api(elements), elements);
  scheduleWireUpkeep(api(elements), elements);
  scheduleWireUpkeep(api(elements), elements);
  expect(frames).toHaveLength(1);
  frames.shift()!(0);
  expect(updateScene).toHaveBeenCalledTimes(1);
  // Once it ran, a later need schedules again.
  scheduleWireUpkeep(api(elements), elements);
  expect(frames).toHaveLength(1);
  frames.shift()!(0);
});

it("deletes the wires left without an end, outside the undo history", () => {
  const wired = withWire([orchestrator, frame, lone], orchestrator.id, frame.id);
  const wire = wired[wired.length - 1];
  const elements = wired.filter((e) => e.id !== frame.id);
  scheduleWireUpkeep(api(elements), elements);
  frames.shift()!(0);
  const update = updateScene.mock.calls[0][0];
  expect(update.captureUpdate).toBe("never");
  expect(update.elements.find((e: ExcalidrawElement) => e.id === wire.id).isDeleted).toBe(true);
});

it("does nothing for a scene that needs nothing", () => {
  const elements = withWire([orchestrator, frame, lone], orchestrator.id, frame.id);
  scheduleWireUpkeep(api(elements), elements);
  expect(frames).toHaveLength(0);
});

it("brings a dropped wire back when its ends come back, as an undo does (plan B3)", () => {
  const wired = withWire([orchestrator, frame, lone], orchestrator.id, frame.id);
  const wire = wired[wired.length - 1];
  const gone = wired.filter((e) => e.id !== frame.id);
  scheduleWireUpkeep(api(gone), gone);
  frames.shift()!(0);
  const dropped = updateScene.mock.calls[0][0].elements.find((e: ExcalidrawElement) => e.id === wire.id);
  expect(dropped.customData.openvibe).toMatchObject({ kind: "wire", orphaned: true });
  // Undo: the frame is back, the wire still deleted.
  updateScene.mockClear();
  const undone = [...wired.filter((e) => e.id !== wire.id), dropped];
  scheduleWireUpkeep(api(undone), undone);
  frames.shift()!(0);
  const revived = updateScene.mock.calls[0][0].elements.find((e: ExcalidrawElement) => e.id === wire.id);
  expect(revived.isDeleted).toBe(false);
  expect(revived.customData.openvibe.orphaned).toBeUndefined();
});
