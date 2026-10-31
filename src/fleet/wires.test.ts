import { describe, expect, it } from "vitest";
import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { createGroupFrame, framesFromScene } from "@/canvas/groups";
import { createNodeElement } from "@/canvas/nodeElement";
import {
  createWire,
  isWire,
  linkedAgents,
  linkTargetAt,
  orchestratorLinks,
  orchestratorTargets,
  orphanWires,
  unmarkedWires,
  WIRE_COLOR,
  withWire,
} from "./wires";

const orchestrator = createNodeElement("orchestrator", { x: 0, y: 0 }) as unknown as ExcalidrawElement;
const frame = createGroupFrame({ x: 600, y: -300, width: 900, height: 600 }, "Backend", { role: "backend", pantheon: "greek" }) as ExcalidrawElement;
const member = { ...createNodeElement("terminal", { x: 1000, y: 0 }), frameId: frame.id } as unknown as ExcalidrawElement;
const lone = createNodeElement("terminal", { x: 0, y: 900 }) as unknown as ExcalidrawElement;
const plain = { ...frame, id: "plain", customData: undefined } as ExcalidrawElement;
const base = [orchestrator, frame, member, lone, plain];

/** An arrow drawn by hand: no mark, bound the other way round. */
function handDrawn(from: ExcalidrawElement, to: ExcalidrawElement): ExcalidrawElement {
  const wire = createWire(from, to);
  return { ...wire, id: `hand-${to.id}`, customData: undefined } as ExcalidrawElement;
}

describe("withWire / createWire", () => {
  it("adds an orange curved arrow without heads, bound at both ends", () => {
    const elements = withWire(base, orchestrator.id, frame.id);
    const wire = elements[elements.length - 1] as ExcalidrawArrowElement;
    expect(wire).toMatchObject({
      type: "arrow",
      strokeColor: WIRE_COLOR,
      startArrowhead: null,
      endArrowhead: null,
      startBinding: { elementId: orchestrator.id },
      endBinding: { elementId: frame.id },
      customData: { openvibe: { kind: "wire" } },
    });
    expect(wire.points).toHaveLength(3);
    expect(isWire(wire)).toBe(true);
    const bound = (id: string) => elements.find((e) => e.id === id)?.boundElements;
    expect(bound(orchestrator.id)).toEqual([{ id: wire.id, type: "arrow" }]);
    expect(bound(frame.id)).toEqual([{ id: wire.id, type: "arrow" }]);
  });

  it("does not wire the same target twice", () => {
    const once = withWire(base, orchestrator.id, lone.id);
    expect(withWire(once, orchestrator.id, lone.id)).toHaveLength(once.length);
  });
});

describe("orchestratorTargets", () => {
  it("finds the groups and terminals wired to the orchestrator, either way round", () => {
    const elements = [...withWire(base, orchestrator.id, frame.id), handDrawn(lone, orchestrator)];
    expect(orchestratorTargets(elements, orchestrator.id)).toEqual({ groupIds: [frame.id], nodeIds: [lone.id] });
  });

  it("drops deleted arrows, deleted targets and plain frames", () => {
    const wired = withWire(withWire(base, orchestrator.id, frame.id), orchestrator.id, plain.id);
    const arrows = wired.filter((e) => e.type === "arrow");
    expect(orchestratorTargets(wired, orchestrator.id)).toEqual({ groupIds: [frame.id], nodeIds: [] });
    const cut = wired.map((e) => (e.id === arrows[0].id ? { ...e, isDeleted: true } : e));
    expect(orchestratorTargets(cut, orchestrator.id).groupIds).toEqual([]);
    const gone = wired.map((e) => (e.id === frame.id ? { ...e, isDeleted: true } : e));
    expect(orchestratorTargets(gone, orchestrator.id).groupIds).toEqual([]);
  });

  it("maps every orchestrator of the scene", () => {
    const elements = withWire(base, orchestrator.id, lone.id);
    expect(orchestratorLinks(elements)).toEqual({ [orchestrator.id]: { groupIds: [], nodeIds: [lone.id] } });
  });
});

describe("unmarkedWires", () => {
  it("lists the hand-drawn arrows between an orchestrator and a target", () => {
    const hand = handDrawn(orchestrator, lone);
    const stray = { ...handDrawn(member, lone), id: "stray" } as ExcalidrawElement;
    const elements = [...withWire(base, orchestrator.id, frame.id), hand, stray];
    expect(unmarkedWires(elements)).toEqual([hand.id]);
  });
});

describe("linkTargetAt", () => {
  it("links a lone terminal, and the group of a terminal inside one", () => {
    const frames = framesFromScene(base);
    expect(linkTargetAt(base, frames, { x: lone.x + 10, y: lone.y + 10 })).toBe(lone.id);
    expect(linkTargetAt(base, frames, { x: member.x + 10, y: member.y + 10 })).toBe(frame.id);
    expect(linkTargetAt(base, frames, { x: frame.x + 5, y: frame.y + 5 })).toBe(frame.id);
    expect(linkTargetAt(base, frames, { x: -5000, y: -5000 })).toBeNull();
  });
});

describe("linkedAgents", () => {
  it("lists the agents of the wired groups, then the terminals wired directly", () => {
    const frames = framesFromScene(base);
    expect(linkedAgents({ groupIds: [frame.id], nodeIds: [lone.id, member.id] }, frames)).toEqual({
      groups: [frames.find((f) => f.id === frame.id)],
      directIds: [lone.id],
      agentIds: [member.id, lone.id],
    });
  });
});

describe("orphanWires (plan B3)", () => {
  const withoutIds = (elements: ExcalidrawElement[], ...ids: string[]) =>
    elements.map((e) => (ids.includes(e.id) ? ({ ...e, isDeleted: true } as ExcalidrawElement) : e));

  it("lists the wires whose target or orchestrator is gone, whatever way it went", () => {
    const wired = withWire(base, orchestrator.id, frame.id);
    const wire = wired[wired.length - 1];
    expect(orphanWires(wired)).toEqual([]);
    expect(orphanWires(withoutIds(wired, frame.id))).toEqual([wire.id]);
    expect(orphanWires(withoutIds(wired, orchestrator.id))).toEqual([wire.id]);
    // Ungroup or Delete: the element left the scene, the arrow lost its binding.
    expect(orphanWires(wired.filter((e) => e.id !== frame.id))).toEqual([wire.id]);
    const unbound = wired.map((e) => (e.id === wire.id ? ({ ...e, endBinding: null } as ExcalidrawElement) : e));
    expect(orphanWires(unbound)).toEqual([wire.id]);
  });

  it("keeps a plain arrow and an already deleted wire out of the list", () => {
    const wired = withWire(base, orchestrator.id, frame.id);
    const wire = wired[wired.length - 1];
    const plainArrow = { ...handDrawn(orchestrator, lone), customData: undefined, endBinding: null } as ExcalidrawElement;
    expect(orphanWires([...withoutIds(wired, frame.id, wire.id), plainArrow])).toEqual([]);
  });

  it("does not take an ungrouped frame for a gone target: a plain frame is no wire target", () => {
    const wired = withWire(base, orchestrator.id, frame.id);
    const ungrouped = wired.map((e) => (e.id === frame.id ? ({ ...e, customData: undefined } as ExcalidrawElement) : e));
    expect(orphanWires(ungrouped)).toEqual([wired[wired.length - 1].id]);
  });
});
