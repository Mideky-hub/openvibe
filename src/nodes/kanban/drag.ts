/** The data type of a Kanban card being dragged: JSON `{ nodeId, cardId }`. */
export const KANBAN_CARD_MIME = "application/x-openvibe-kanban-card";

export interface KanbanCardDrag {
  nodeId: string;
  cardId: string;
}

/** Reads a dragged card's data; null when it is not one. */
export function readCardDrag(raw: string): KanbanCardDrag | null {
  try {
    const value = JSON.parse(raw) as Partial<KanbanCardDrag>;
    return typeof value.nodeId === "string" && typeof value.cardId === "string" ? { nodeId: value.nodeId, cardId: value.cardId } : null;
  } catch {
    return null;
  }
}
