import type { GithubIssue, GithubProjectItem, IssueState } from "../ipc/github";

// Pure GitHub <-> Kanban sync logic: merging remote issues / project items into a board,
// and deciding which remote calls a local column move implies. No IO here.

export type Priority = "none" | "low" | "medium" | "high";

export interface GithubLink {
  repo: string;
  number: number;
  url: string;
  state: IssueState;
}

export interface Card {
  id: string;
  title: string;
  notes: string;
  due?: string;
  priority: Priority;
  github?: GithubLink;
}

export interface Column {
  id: string;
  title: string;
  cardIds: string[];
}

export interface Board {
  columns: Column[];
  cards: Record<string, Card>;
}

export type RemoteAction =
  | { type: "moveProjectItem"; itemId: string; status: string }
  | { type: "setIssueState"; repo: string; number: number; state: IssueState };

const DONE_TITLES = ["done", "closed", "terminé", "termine", "fait", "fermé", "ferme"];
const DEFAULT_COLUMNS = ["To do", "In progress", "Done"];

const normalize = (title: string) => title.trim().toLowerCase();

/** Identity of an issue across repos: "owner/name#12", repo lowercased so it compares case-insensitively. */
export const githubKey = (repo: string, number: number) => `${repo.trim().toLowerCase()}#${number}`;

/** Column titled like "Done" / "Terminé" / "Fait", else the last column; undefined on an empty board. */
export function doneColumn(board: Board): Column | undefined {
  return board.columns.find((c) => DONE_TITLES.includes(normalize(c.title))) ?? board.columns[board.columns.length - 1];
}

export function issueToCard(issue: GithubIssue, repo: string, id: string): Card {
  return {
    id,
    title: issue.title,
    notes: issue.body,
    priority: "none",
    github: { repo, number: issue.number, url: issue.url, state: issue.state },
  };
}

/**
 * Null for drafts and for items without repo/number: there is no issue to link them to.
 * The state defaults to open; the issue list, when available, knows better.
 */
export function projectItemToCard(item: GithubProjectItem, id: string, state: IssueState = "open"): Card | null {
  const { kind, repo, number, url, body } = item.content;
  if (kind === "draft" || repo === null || number === null) return null;
  return {
    id,
    title: item.title,
    notes: body,
    priority: "none",
    github: { repo, number, url: url ?? "", state },
  };
}

export interface MergeOptions {
  repo: string;
  issues: GithubIssue[];
  /** When given, an item's Status decides its column (created at the end if missing). */
  projectItems?: GithubProjectItem[];
  /**
   * Status options of the project. When given, a linked card sitting in a column that is not one of them
   * (parked locally) is left there instead of following its Status.
   */
  projectStatuses?: string[];
  newId?: () => string;
}

interface Remote {
  title: string;
  body: string;
  link: GithubLink;
  /** False for a project item absent from the issue list: its open/closed state is unknown. */
  stateKnown: boolean;
  status: string | null;
}

/**
 * Merges remote issues (and project items) into `board`, returning a new board.
 * Linked cards are matched by `githubKey`: title and link are refreshed, local notes/due/priority are kept,
 * and the card moves only when its remote placement changed (Status differs from its column, or the issue
 * was opened/closed since the last sync). Cards whose issue is no longer listed are left untouched.
 */
export function mergeGithub(board: Board, options: MergeOptions): Board {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const columns = board.columns.map((c) => ({ ...c, cardIds: [...c.cardIds] }));
  const cards = { ...board.cards };
  const next: Board = { columns, cards };
  const statusOptions = options.projectStatuses?.map(normalize);

  const linked = new Map<string, string>();
  for (const card of Object.values(cards)) {
    if (card.github) linked.set(githubKey(card.github.repo, card.github.number), card.id);
  }

  const columnOf = (cardId: string) => columns.find((c) => c.cardIds.includes(cardId));

  const columnTitled = (title: string) => {
    const existing = columns.find((c) => normalize(c.title) === normalize(title));
    if (existing) return existing;
    const created: Column = { id: newId(), title: title.trim(), cardIds: [] };
    columns.push(created);
    return created;
  };

  const columnForState = (state: IssueState) => {
    if (columns.length === 0) DEFAULT_COLUMNS.forEach(columnTitled);
    return state === "closed" ? doneColumn(next)! : columns[0];
  };

  const place = (cardId: string, target: Column) => {
    const current = columnOf(cardId);
    if (current === target) return;
    if (current) current.cardIds = current.cardIds.filter((id) => id !== cardId);
    target.cardIds.push(cardId);
  };

  for (const [key, remote] of collectRemotes(options)) {
    const existingId = linked.get(key);
    if (existingId === undefined) {
      const card: Card = { id: newId(), title: remote.title, notes: remote.body, priority: "none", github: remote.link };
      cards[card.id] = card;
      place(card.id, remote.status ? columnTitled(remote.status) : columnForState(remote.link.state));
      continue;
    }

    const existing = cards[existingId];
    const previousState = existing.github!.state;
    const link = remote.stateKnown ? remote.link : { ...remote.link, state: previousState };
    cards[existingId] = { ...existing, title: remote.title, github: link };
    const current = columnOf(existingId);

    if (remote.status) {
      const parked = current !== undefined && statusOptions !== undefined && !statusOptions.includes(normalize(current.title));
      if (!current || (!parked && normalize(current.title) !== normalize(remote.status))) {
        place(existingId, columnTitled(remote.status));
      }
    } else if (!current || previousState !== link.state) {
      place(existingId, columnForState(link.state));
    }
  }

  return next;
}

/** Remote entries by key: issues first, then project items (which bring the Status and may add other repos). */
function collectRemotes({ repo, issues, projectItems = [] }: MergeOptions): Map<string, Remote> {
  const remotes = new Map<string, Remote>();
  for (const issue of issues) {
    const { title, notes, github } = issueToCard(issue, repo, "");
    remotes.set(githubKey(repo, issue.number), { title, body: notes, link: github!, stateKnown: true, status: null });
  }
  for (const item of projectItems) {
    const card = projectItemToCard(item, "");
    if (!card) continue;
    const status = item.status?.trim() || null;
    const key = githubKey(card.github!.repo, card.github!.number);
    const fromIssues = remotes.get(key);
    if (fromIssues) fromIssues.status = status;
    else remotes.set(key, { title: card.title, body: card.notes, link: card.github!, stateKnown: false, status });
  }
  return remotes;
}

export interface MoveContext {
  /** Status options of the linked project, if any. */
  projectStatuses?: string[];
  /** Project item id by `githubKey`, for cards that belong to the project. */
  projectItemIdByKey?: Record<string, string>;
}

/**
 * Remote calls implied by moving `cardId` to `toColumnId` (call it before applying the move locally):
 * - the project item's Status follows when the target column is named like a Status option;
 * - entering the done column (see `doneColumn`) closes an open issue, leaving it reopens a closed one.
 */
export function remoteActionsForMove(board: Board, cardId: string, toColumnId: string, context: MoveContext = {}): RemoteAction[] {
  const link = board.cards[cardId]?.github;
  const from = board.columns.find((c) => c.cardIds.includes(cardId));
  const to = board.columns.find((c) => c.id === toColumnId);
  if (!link || !to || from?.id === to.id) return [];

  const actions: RemoteAction[] = [];

  const itemId = context.projectItemIdByKey?.[githubKey(link.repo, link.number)];
  const status = context.projectStatuses?.find((s) => normalize(s) === normalize(to.title));
  if (itemId && status) actions.push({ type: "moveProjectItem", itemId, status });

  const done = doneColumn(board)!;
  if (to.id === done.id && link.state === "open") {
    actions.push({ type: "setIssueState", repo: link.repo, number: link.number, state: "closed" });
  } else if (from?.id === done.id && link.state === "closed") {
    actions.push({ type: "setIssueState", repo: link.repo, number: link.number, state: "open" });
  }
  return actions;
}
