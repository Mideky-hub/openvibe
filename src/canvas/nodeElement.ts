import type { ExcalidrawElement, ExcalidrawEmbeddableElement } from "@excalidraw/excalidraw/element/types";

export type NodeKind = "terminal" | "orchestrator" | "note" | "kanban" | "git" | "file";

const NODE_KINDS: readonly NodeKind[] = ["terminal", "orchestrator", "note", "kanban", "git", "file"];

export const NODE_SIZE: Record<NodeKind, { width: number; height: number }> = {
  terminal: { width: 720, height: 440 },
  orchestrator: { width: 640, height: 760 },
  note: { width: 320, height: 240 },
  kanban: { width: 640, height: 400 },
  git: { width: 360, height: 320 },
  file: { width: 520, height: 420 },
};

const LINK_PATTERN = /^openvibe:\/\/(terminal|orchestrator|note|kanban|git|file)\/[\w-]+$/;

/** Only our own nodes may be embedded: no arbitrary iframes on the canvas. */
export function isOpenVibeLink(link: string): boolean {
  return LINK_PATTERN.test(link);
}

export function nodeKindOf(element: ExcalidrawElement): NodeKind | null {
  const kind: unknown = element.customData?.kind;
  return element.type === "embeddable" && NODE_KINDS.includes(kind as NodeKind) ? (kind as NodeKind) : null;
}

/**
 * Builds a complete embeddable element for an OpenVibe node, centered on `center`
 * (scene coordinates). Excalidraw's skeleton API does not accept embeddables, so
 * every base field is set here; `index: null` lets Excalidraw assign the order.
 */
export function createNodeElement(kind: NodeKind, center: { x: number; y: number }): ExcalidrawEmbeddableElement {
  const id = crypto.randomUUID();
  const { width, height } = NODE_SIZE[kind];
  const random = () => Math.floor(Math.random() * 2 ** 31);
  return {
    id,
    type: "embeddable",
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    angle: 0 as ExcalidrawEmbeddableElement["angle"],
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roundness: null,
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
    link: `openvibe://${kind}/${id}`,
    locked: false,
    customData: { kind },
  };
}
