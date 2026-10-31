import type { ExcalidrawArrowElement, ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { groupAt, groupInfoOf, type SceneFrame } from "@/canvas/groups";
import { findTerminalAt } from "@/canvas/hitTest";
import { nodeKindOf } from "@/canvas/nodeElement";
import type { Point } from "./terminals";

/** The orange of the wires (spec habillage §13). */
export const WIRE_COLOR = "#C2603F";

/** Space between a wire's ends and the elements it joins. */
const GAP = 8;

/** What an orchestrator is wired to. */
export interface Links {
  groupIds: string[];
  nodeIds: string[];
}

export const NO_LINKS: Links = { groupIds: [], nodeIds: [] };

export function isWire(element: ExcalidrawElement): boolean {
  const data = element.customData?.openvibe as { kind?: unknown } | undefined;
  return data?.kind === "wire";
}

/** What an orchestrator can be wired to: a group's frame or a terminal (not a plain frame). */
function isWireTarget(element: ExcalidrawElement | undefined): element is ExcalidrawElement {
  return element !== undefined && !element.isDeleted && (groupInfoOf(element) !== null || nodeKindOf(element) === "terminal");
}

/** The element at the other end of an arrow bound to `orchestratorId`, either way round. */
function otherEnd(arrow: ExcalidrawElement, orchestratorId: string): string | null {
  if (arrow.type !== "arrow") return null;
  const start = arrow.startBinding?.elementId;
  const end = arrow.endBinding?.elementId;
  if (start === orchestratorId) return end ?? null;
  if (end === orchestratorId) return start ?? null;
  return null;
}

/**
 * The groups and terminals wired to an orchestrator, from the arrows of the
 * scene: deleting an arrow or its target cuts the link (spec §13).
 */
export function orchestratorTargets(elements: readonly ExcalidrawElement[], orchestratorId: string): Links {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const links: Links = { groupIds: [], nodeIds: [] };
  for (const element of elements) {
    if (element.isDeleted) continue;
    const otherId = otherEnd(element, orchestratorId);
    const other = otherId ? byId.get(otherId) : undefined;
    if (!isWireTarget(other)) continue;
    if (groupInfoOf(other)) {
      if (!links.groupIds.includes(other.id)) links.groupIds.push(other.id);
    } else if (!links.nodeIds.includes(other.id)) {
      links.nodeIds.push(other.id);
    }
  }
  return links;
}

/** The links of every orchestrator of the scene. */
export function orchestratorLinks(elements: readonly ExcalidrawElement[]): Record<string, Links> {
  return Object.fromEntries(
    elements
      .filter((e) => !e.isDeleted && nodeKindOf(e) === "orchestrator")
      .map((o) => [o.id, orchestratorTargets(elements, o.id)]),
  );
}

export function sameLinks(a: Record<string, Links>, b: Record<string, Links>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((id, i) => id === y[i]);
  return keys.every((k) => b[k] !== undefined && same(a[k].groupIds, b[k].groupIds) && same(a[k].nodeIds, b[k].nodeIds));
}

/**
 * A complete arrow from the side of `orchestrator` facing `target` to the side
 * of `target` facing it, curving gently, without heads (spec §13). Every base
 * field is set here, as for the nodes (Excalidraw's skeletons cannot bind to
 * existing elements).
 */
export function createWire(orchestrator: ExcalidrawElement, target: ExcalidrawElement): ExcalidrawArrowElement {
  const toRight = target.x + target.width / 2 >= orchestrator.x + orchestrator.width / 2;
  const start = {
    x: toRight ? orchestrator.x + orchestrator.width + GAP : orchestrator.x - GAP,
    y: orchestrator.y + orchestrator.height / 2,
  };
  const end = {
    x: toRight ? target.x - GAP : target.x + target.width + GAP,
    y: target.y + target.height / 2,
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const points = [
    [0, 0],
    [dx / 2, dy / 2 - Math.abs(dx) * 0.12],
    [dx, dy],
  ] as const;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const random = () => Math.floor(Math.random() * 2 ** 31);
  return {
    id: crypto.randomUUID(),
    type: "arrow",
    x: start.x,
    y: start.y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    angle: 0 as ExcalidrawArrowElement["angle"],
    strokeColor: WIRE_COLOR,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    // Excalidraw's ROUNDNESS.PROPORTIONAL_RADIUS: the line curves through its middle point.
    roundness: { type: 2 },
    roughness: 0,
    opacity: 100,
    seed: random(),
    version: 1,
    versionNonce: random(),
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    points: points.map(([x, y]) => [x, y]) as unknown as ExcalidrawArrowElement["points"],
    lastCommittedPoint: null,
    startBinding: { elementId: orchestrator.id, focus: 0, gap: GAP },
    endBinding: { elementId: target.id, focus: 0, gap: GAP },
    startArrowhead: null,
    endArrowhead: null,
    elbowed: false,
    customData: { openvibe: { kind: "wire" } },
  };
}

/** `elements` with a new wire, recorded on both ends, unless one already joins them (spec §13). */
export function withWire(elements: readonly ExcalidrawElement[], orchestratorId: string, targetId: string): ExcalidrawElement[] {
  const orchestrator = elements.find((e) => e.id === orchestratorId && !e.isDeleted);
  const target = elements.find((e) => e.id === targetId && !e.isDeleted);
  if (!orchestrator || !target) return [...elements];
  const links = orchestratorTargets(elements, orchestratorId);
  if (links.groupIds.includes(targetId) || links.nodeIds.includes(targetId)) return [...elements];
  const wire = createWire(orchestrator, target);
  const bind = (e: ExcalidrawElement): ExcalidrawElement => ({
    ...e,
    boundElements: [...(e.boundElements ?? []), { id: wire.id, type: "arrow" }],
    version: e.version + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 31),
    updated: Date.now(),
  });
  return [...elements.map((e) => (e.id === orchestratorId || e.id === targetId ? bind(e) : e)), wire];
}

/** Arrows drawn by hand between an orchestrator and a group or terminal: they get the wire mark (spec §13). */
export function unmarkedWires(elements: readonly ExcalidrawElement[]): string[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const orchestrators = elements.filter((e) => !e.isDeleted && nodeKindOf(e) === "orchestrator").map((e) => e.id);
  return elements
    .filter((e) => !e.isDeleted && e.type === "arrow" && !isWire(e))
    .filter((arrow) =>
      orchestrators.some((id) => {
        const otherId = otherEnd(arrow, id);
        return isWireTarget(otherId ? byId.get(otherId) : undefined);
      }),
    )
    .map((arrow) => arrow.id);
}

/** What a click of "Relier" designates: a lone terminal, else the group under the pointer (spec §13). */
export function linkTargetAt(elements: readonly ExcalidrawElement[], frames: readonly SceneFrame[], point: Point): string | null {
  const terminal = findTerminalAt(elements, point.x, point.y);
  if (terminal) {
    const group = frames.find((f) => f.group !== null && f.memberIds.includes(terminal.id));
    return group ? group.id : terminal.id;
  }
  return groupAt(frames, point)?.id ?? null;
}

/** The agents an orchestrator commands. */
export interface LinkedAgents {
  groups: SceneFrame[];
  /** Terminals wired directly, outside the wired groups. */
  directIds: string[];
  agentIds: string[];
}

export function linkedAgents(links: Links, frames: readonly SceneFrame[]): LinkedAgents {
  const groups = links.groupIds.flatMap((id) => frames.filter((f) => f.id === id && f.group !== null));
  const inGroups = groups.flatMap((g) => g.memberIds);
  const directIds = links.nodeIds.filter((id) => !inGroups.includes(id));
  return { groups, directIds, agentIds: [...new Set([...inGroups, ...directIds])] };
}

/** What a wire can still join: an orchestrator, a terminal or a group's frame, alive. */
function isWireEnd(element: ExcalidrawElement | undefined): boolean {
  return element !== undefined && (nodeKindOf(element) === "orchestrator" ? !element.isDeleted : isWireTarget(element));
}

/**
 * Wires with a missing end: ungrouping, closing a group or a terminal and
 * Suppr on an orchestrator leave the orange arrow behind, unbound or bound to
 * what is gone (plan B3). They go in the same update.
 */
export function orphanWires(elements: readonly ExcalidrawElement[]): string[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  return elements
    .filter((e) => !e.isDeleted && e.type === "arrow" && isWire(e))
    .filter((arrow) => {
      const { startBinding, endBinding } = arrow as ExcalidrawArrowElement;
      return ![startBinding, endBinding].every((b) => b && isWireEnd(byId.get(b.elementId)));
    })
    .map((arrow) => arrow.id);
}
