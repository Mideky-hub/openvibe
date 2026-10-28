import type { KanbanColumn, KanbanPayload, KanbanPriority } from "@/nodes/types";
import { addColumn, columnOf, updateCard, type NewId } from "./board";
import { doneColumn } from "./githubSync";

// Pure Kanban <-> orchestrator logic: a column handed to an orchestrator, the request
// typed in its terminal, what its `board` tool reads, and where a mission's cards go. No IO here.

const IN_PROGRESS_TITLES = ["en cours", "in progress", "doing", "wip"];
/** Notes longer than this are cut in the request: the `board` tool gives them whole. */
const MAX_NOTES = 280;

const normalize = (title: string) => title.trim().toLowerCase();
const oneLine = (value: string) => value.replace(/\s*[\r\n]+\s*/g, " ").trim();

/** Remembers that `columnId` of the board is planned by the orchestrator `nodeId`. */
export function linkOrchestrator(board: KanbanPayload, nodeId: string, columnId: string): KanbanPayload {
  if (!board.columns.some((c) => c.id === columnId)) return board;
  return { ...board, orchestrator: { nodeId, columnId } };
}

/** Whether the board was handed to this orchestrator. */
export const linkedTo = (board: KanbanPayload, orchestratorId: string) => board.orchestrator?.nodeId === orchestratorId;

/** Column titled like "En cours" / "In progress", if any. */
export function inProgressColumn(board: KanbanPayload): KanbanColumn | undefined {
  return board.columns.find((c) => IN_PROGRESS_TITLES.includes(normalize(c.title)));
}

/** The board with an "in progress" column: the existing one, else a new one titled `title`, placed before the done column. */
export function withInProgressColumn(board: KanbanPayload, title: string, newId?: NewId): { board: KanbanPayload; columnId: string } {
  const existing = inProgressColumn(board);
  if (existing) return { board, columnId: existing.id };
  const done = doneColumn(board);
  const added = addColumn(board, title, newId);
  const column = added.columns[added.columns.length - 1];
  if (!done) return { board: added, columnId: column.id };
  const columns = added.columns.filter((c) => c.id !== column.id);
  columns.splice(columns.findIndex((c) => c.id === done.id), 0, column);
  return { board: { ...added, columns }, columnId: column.id };
}

/**
 * A mission starts on a card: its agent shows as a chip, and the column it goes
 * to (created if absent) is returned; the move itself is the caller's, so that
 * GitHub follows. Null for a card the board does not have.
 */
export function startCard(board: KanbanPayload, cardId: string, agent: string, title: string, newId?: NewId): { board: KanbanPayload; columnId: string } | null {
  if (!board.cards[cardId]) return null;
  const placed = withInProgressColumn(board, title, newId);
  return { board: updateCard(placed.board, cardId, { agent }), columnId: placed.columnId };
}

/** Where a card goes when its agent reports done (see `doneColumn`); null when it is already there or unknown. */
export function doneTarget(board: KanbanPayload, cardId: string): string | null {
  if (!board.cards[cardId]) return null;
  const done = doneColumn(board);
  return done && columnOf(board, cardId)?.id !== done.id ? done.id : null;
}

export interface RequestTexts {
  request: (column: string, count: number, cards: string) => string;
  priorities: Record<Exclude<KanbanPriority, "none">, string>;
  due: (date: string) => string;
  issue: (number: number, repo: string) => string;
}

/**
 * What « Planifier avec l'orchestrateur » types in the orchestrator's terminal:
 * one line (a line break would send it early) listing the column's cards. Null
 * for an unknown or empty column.
 */
export function planRequest(board: KanbanPayload, columnId: string, texts: RequestTexts): string | null {
  const column = board.columns.find((c) => c.id === columnId);
  const cards = column?.cardIds.map((id) => board.cards[id]).filter((c) => c !== undefined) ?? [];
  if (!column || cards.length === 0) return null;
  const items = cards.map((card, i) => {
    const parts = [`${i + 1}) [${card.id}] ${oneLine(card.title)}`];
    const notes = oneLine(card.notes);
    if (notes) parts.push(notes.length > MAX_NOTES ? `${notes.slice(0, MAX_NOTES - 1)}…` : notes);
    if (card.priority !== "none") parts.push(texts.priorities[card.priority]);
    if (card.due) parts.push(texts.due(card.due));
    if (card.github) parts.push(texts.issue(card.github.number, card.github.repo));
    return parts.join(" — ");
  });
  return texts.request(oneLine(column.title), cards.length, items.join(" | "));
}

/** What the orchestrator's `board` tool reads of one board. */
export function boardView(nodeId: string, board: KanbanPayload) {
  return {
    board: nodeId,
    github: board.github?.repo ?? null,
    columns: board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      linked: board.orchestrator?.columnId === column.id,
      cards: column.cardIds.flatMap((id) => {
        const card = board.cards[id];
        if (!card) return [];
        return [
          {
            id: card.id,
            title: card.title,
            notes: card.notes,
            priority: card.priority,
            due: card.due ?? null,
            github: card.github ? { repo: card.github.repo, number: card.github.number, url: card.github.url, state: card.github.state } : null,
            agent: card.agent ?? null,
          },
        ];
      }),
    })),
  };
}
