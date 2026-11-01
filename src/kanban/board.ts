import type { KanbanCard, KanbanColumn, KanbanPayload, KanbanPriority } from "@/nodes/types";

/** Operations on a Kanban board (issue #29). Each returns a new board and leaves its input untouched. */

export type NewId = () => string;

const uuid: NewId = () => crypto.randomUUID();

/** A new board: three columns named in the interface's language. */
export function emptyBoard(titles: readonly string[], newId: NewId = uuid): KanbanPayload {
  return { columns: titles.map((title) => ({ id: newId(), title, cardIds: [] })), cards: {} };
}

export function addColumn(board: KanbanPayload, title: string, newId: NewId = uuid): KanbanPayload {
  return { ...board, columns: [...board.columns, { id: newId(), title, cardIds: [] }] };
}

export function renameColumn(board: KanbanPayload, columnId: string, title: string): KanbanPayload {
  return { ...board, columns: board.columns.map((c) => (c.id === columnId ? { ...c, title } : c)) };
}

/** Removes a column and the cards in it. */
export function removeColumn(board: KanbanPayload, columnId: string): KanbanPayload {
  const column = board.columns.find((c) => c.id === columnId);
  if (!column) return board;
  const cards = { ...board.cards };
  for (const id of column.cardIds) delete cards[id];
  return { columns: board.columns.filter((c) => c.id !== columnId), cards };
}

export interface CardDraft {
  title: string;
  notes: string;
  due?: string;
  priority: KanbanPriority;
}

/** Adds a card at the end of a column; an unknown column leaves the board as it is. */
export function addCard(board: KanbanPayload, columnId: string, draft: CardDraft, newId: NewId = uuid): KanbanPayload {
  if (!board.columns.some((c) => c.id === columnId)) return board;
  const id = newId();
  const card: KanbanCard = { id, title: draft.title, notes: draft.notes, priority: draft.priority };
  if (draft.due) card.due = draft.due;
  return {
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, cardIds: [...c.cardIds, id] } : c)),
    cards: { ...board.cards, [id]: card },
  };
}

export function updateCard(board: KanbanPayload, cardId: string, patch: Partial<Omit<KanbanCard, "id">>): KanbanPayload {
  const card = board.cards[cardId];
  if (!card) return board;
  const next: KanbanCard = { ...card, ...patch };
  if (!next.due) delete next.due;
  if (!next.agentStatus) delete next.agentStatus;
  return { ...board, cards: { ...board.cards, [cardId]: next } };
}

export function removeCard(board: KanbanPayload, cardId: string): KanbanPayload {
  if (!board.cards[cardId]) return board;
  const cards = { ...board.cards };
  delete cards[cardId];
  return { columns: board.columns.map((c) => ({ ...c, cardIds: c.cardIds.filter((id) => id !== cardId) })), cards };
}

/** The column holding a card, if any. */
export function columnOf(board: KanbanPayload, cardId: string): KanbanColumn | undefined {
  return board.columns.find((c) => c.cardIds.includes(cardId));
}

/**
 * Moves a card to `index` of a column (its end when omitted or past it). The
 * index counts the target's cards without the moved one, so a move within the
 * same column lands where it was dropped.
 */
export function moveCard(board: KanbanPayload, cardId: string, toColumnId: string, index?: number): KanbanPayload {
  if (!board.cards[cardId] || !board.columns.some((c) => c.id === toColumnId)) return board;
  const columns = board.columns.map((c) => {
    const without = c.cardIds.filter((id) => id !== cardId);
    if (c.id !== toColumnId) return without.length === c.cardIds.length ? c : { ...c, cardIds: without };
    const at = index === undefined ? without.length : Math.max(0, Math.min(index, without.length));
    return { ...c, cardIds: [...without.slice(0, at), cardId, ...without.slice(at)] };
  });
  return { ...board, columns };
}

/** What a card dropped on a terminal sends to its agent: the title, then the notes. */
export function cardText(card: Pick<KanbanCard, "title" | "notes">): string {
  const title = card.title.trim();
  const notes = card.notes.trim();
  return notes ? `${title}\n\n${notes}` : title;
}

export type DuePreset = "today" | "tomorrow" | "nextWeek";

const pad = (n: number) => String(n).padStart(2, "0");

/** A local date as YYYY-MM-DD. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The due date of a preset, from `now`. */
export function dueOf(preset: DuePreset, now: Date = new Date()): string {
  const days = preset === "today" ? 0 : preset === "tomorrow" ? 1 : 7;
  return isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

/** A due date relative to today: past dates are overdue. */
export function dueState(due: string, now: Date = new Date()): "overdue" | "today" | "later" {
  const today = isoDate(now);
  return due < today ? "overdue" : due === today ? "today" : "later";
}
