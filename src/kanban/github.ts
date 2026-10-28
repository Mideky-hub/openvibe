import { toast } from "sonner";
import { messages } from "@/i18n";
import {
  githubCreateIssue,
  githubDetectRepo,
  githubListIssues,
  githubListProjectItems,
  githubMoveProjectItem,
  githubProjectStatuses,
  githubSetIssueState,
  type IssueState,
} from "@/ipc/github";
import { AppError } from "@/ipc/invoke";
import type { KanbanBoardLink, KanbanPayload } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { projectsStore } from "@/store/projects";
import { moveCard, updateCard } from "./board";
import { githubKey, mergeGithub, remoteActionsForMove, type MoveContext, type RemoteAction } from "./githubSync";
import { kanbanMessages } from "./messages";

// The Kanban node's GitHub wiring (issue #29): `gh` runs in the project's folder.

/** Closed issues older than this are left out of a sync. */
const CLOSED_WITHIN_DAYS = 30;

/** What the last sync learned about each board's Project: its Status options and item ids. */
const projectContexts = new Map<string, MoveContext>();

function boardOf(nodeId: string): KanbanPayload | null {
  const record = nodesStore.getState().nodes[nodeId];
  return record?.kind === "kanban" ? record.payload : null;
}

function save(nodeId: string, board: KanbanPayload) {
  nodesStore.getState().update(nodeId, board);
}

/** The folder of the open project, where `gh` and `git` run. */
export function projectPath(): string | null {
  const { projects, activeId } = projectsStore.getState();
  return projects.find((p) => p.id === activeId)?.path ?? null;
}

/** A failure told to the user: `gh` errors already say what to do (install, `gh auth login`, project scope). */
export function reportGithubError(error: unknown) {
  const detail = error instanceof AppError || error instanceof Error ? error.message : String(error);
  toast.error(messages(kanbanMessages).github.failed(detail));
}

/** « owner/number » or a Project URL (…/users|orgs/owner/projects/number); null when it is neither. */
export function parseProject(text: string): KanbanBoardLink["project"] | null {
  const trimmed = text.trim();
  const url = /github\.com\/(?:orgs|users)\/([\w.-]+)\/projects\/(\d+)/.exec(trimmed);
  const short = /^([\w.-]+)\/(\d+)$/.exec(trimmed);
  const match = url ?? short;
  if (!match) return null;
  const number = Number(match[2]);
  return number > 0 ? { owner: match[1], number } : null;
}

/** The repository of the project's `origin` remote, null when it is not on GitHub. */
export async function detectRepo(): Promise<string | null> {
  const path = projectPath();
  return path ? githubDetectRepo(path) : null;
}

/** Remembers the board's repository (and Project); an empty link unlinks it. */
export function linkBoard(nodeId: string, link: KanbanBoardLink | null) {
  if (!boardOf(nodeId)) return;
  projectContexts.delete(nodeId);
  // `update` merges: an unlink sets the field to undefined, which the saved JSON drops.
  nodesStore.getState().update(nodeId, { github: link ?? undefined });
}

async function loadProject(path: string, project: NonNullable<KanbanBoardLink["project"]>) {
  const [items, statuses] = await Promise.all([
    githubListProjectItems(path, project.owner, project.number),
    githubProjectStatuses(path, project.owner, project.number),
  ]);
  const projectItemIdByKey: Record<string, string> = {};
  for (const item of items) {
    if (item.content.repo !== null && item.content.number !== null) {
      projectItemIdByKey[githubKey(item.content.repo, item.content.number)] = item.id;
    }
  }
  return { items, statuses, context: { projectStatuses: statuses, projectItemIdByKey } satisfies MoveContext };
}

/** « Synchroniser »: issues (and Project items) merged into the board. True when it went through. */
export async function syncBoard(nodeId: string): Promise<boolean> {
  const link = boardOf(nodeId)?.github;
  const path = projectPath();
  if (!link || !path) return false;
  try {
    const issues = await githubListIssues(path, link.repo, CLOSED_WITHIN_DAYS);
    const project = link.project ? await loadProject(path, link.project) : null;
    // Read again: the board may have changed while gh answered.
    const board = boardOf(nodeId);
    if (!board) return false;
    if (project) projectContexts.set(nodeId, project.context);
    save(nodeId, mergeGithub(board, { repo: link.repo, issues, projectItems: project?.items, projectStatuses: project?.statuses }));
    toast.success(messages(kanbanMessages).github.synced(link.repo));
    return true;
  } catch (error) {
    reportGithubError(error);
    return false;
  }
}

/** The Project context of a board, read from GitHub when no sync brought it yet. */
async function moveContext(nodeId: string, path: string, link: KanbanBoardLink | undefined): Promise<MoveContext> {
  if (!link?.project) return {};
  const known = projectContexts.get(nodeId);
  if (known) return known;
  const { context } = await loadProject(path, link.project);
  projectContexts.set(nodeId, context);
  return context;
}

async function run(path: string, link: KanbanBoardLink | undefined, action: RemoteAction) {
  if (action.type === "setIssueState") return githubSetIssueState(path, action.repo, action.number, action.state);
  if (link?.project) return githubMoveProjectItem(path, link.project.owner, link.project.number, action.itemId, action.status);
}

/**
 * Moves a card; a linked card's issue (and Project item) follows on GitHub.
 * The remote actions are decided on the board before the move; a failure is
 * told, and the card stays where it was dropped.
 */
export async function moveCardWithGithub(nodeId: string, cardId: string, toColumnId: string, index?: number) {
  const before = boardOf(nodeId);
  if (!before) return;
  const linked = before.cards[cardId]?.github !== undefined;
  const path = linked ? projectPath() : null;
  let actions: RemoteAction[] = [];
  let failure: unknown = null;
  if (path) {
    try {
      actions = remoteActionsForMove(before, cardId, toColumnId, await moveContext(nodeId, path, before.github));
    } catch (error) {
      failure = error;
      // Without the Project, the issue's state still follows.
      actions = remoteActionsForMove(before, cardId, toColumnId);
    }
  }
  const current = boardOf(nodeId);
  if (current) save(nodeId, moveCard(current, cardId, toColumnId, index));
  for (const action of actions) {
    try {
      await run(path!, before.github, action);
      if (action.type === "setIssueState") setIssueState(nodeId, cardId, action.state);
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) reportGithubError(failure);
}

function setIssueState(nodeId: string, cardId: string, state: IssueState) {
  const board = boardOf(nodeId);
  const link = board?.cards[cardId]?.github;
  if (board && link) save(nodeId, updateCard(board, cardId, { github: { ...link, state } }));
}

/** « Créer l'issue sur GitHub »: the card's title and notes become an issue of the board's repository. */
export async function createIssueForCard(nodeId: string, cardId: string): Promise<boolean> {
  const board = boardOf(nodeId);
  const card = board?.cards[cardId];
  const repo = board?.github?.repo;
  const path = projectPath();
  if (!card || card.github || !repo || !path) return false;
  try {
    const created = await githubCreateIssue(path, repo, card.title, card.notes);
    const latest = boardOf(nodeId);
    if (!latest?.cards[cardId]) return false;
    save(nodeId, updateCard(latest, cardId, { github: { repo, number: created.number, url: created.url, state: "open" } }));
    toast.success(messages(kanbanMessages).github.created(created.number));
    return true;
  } catch (error) {
    reportGithubError(error);
    return false;
  }
}
