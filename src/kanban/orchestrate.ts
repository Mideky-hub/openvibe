import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { addOrchestrator } from "@/fleet/orchestrators";
import { messages } from "@/i18n";
import { notify } from "@/mission/events";
import type { Member, SubTask } from "@/mission/mission";
import type { KanbanAgentStatus, KanbanPayload } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { moveCardWithGithub } from "./github";
import { kanbanMessages } from "./messages";
import { doneTarget, flagCard, linkedTo, linkOrchestrator, planRequest, setCardAgent, startCard } from "./missionLink";

// The Kanban node's orchestrator wiring: « Planifier avec l'orchestrateur », and its cards following the mission.

const t = () => messages(kanbanMessages);

function boardOf(nodeId: string): KanbanPayload | null {
  const record = nodesStore.getState().nodes[nodeId];
  return record?.kind === "kanban" ? record.payload : null;
}

/** The boards handed to an orchestrator. */
export function linkedBoards(orchestratorId: string): { nodeId: string; board: KanbanPayload }[] {
  return Object.entries(nodesStore.getState().nodes).flatMap(([nodeId, record]) =>
    record.kind === "kanban" && linkedTo(record.payload, orchestratorId) ? [{ nodeId, board: record.payload }] : [],
  );
}

/** Right of the board, for a new orchestrator. */
function besideBoard(boardId: string) {
  const element = canvasStore.getState().api?.getSceneElements().find((e) => e.id === boardId);
  if (!element) return null;
  return { x: element.x + element.width + 80 + 320, y: element.y + 380 };
}

/**
 * « Planifier avec l'orchestrateur »: the column is handed to `orchestratorId`
 * (a new one with null) and its cards typed in its terminal, as soon as it is free.
 */
export async function planWithOrchestrator(boardId: string, columnId: string, orchestratorId: string | null): Promise<boolean> {
  const record = nodesStore.getState().nodes[boardId];
  const board = boardOf(boardId);
  if (!record || !board) return false;
  const text = planRequest(board, columnId, t().plan);
  if (!text) {
    toast.error(t().plan.empty(board.columns.find((c) => c.id === columnId)?.title ?? ""));
    return false;
  }
  let target = orchestratorId;
  if (target === null) {
    const spot = besideBoard(boardId);
    target = spot ? await addOrchestrator(record.workspaceId, spot) : null;
  }
  const orchestrator = target ? nodesStore.getState().nodes[target] : undefined;
  if (!target || orchestrator?.kind !== "orchestrator") return false;
  const latest = boardOf(boardId);
  if (latest) nodesStore.getState().update(boardId, { orchestrator: linkOrchestrator(latest, target, columnId).orchestrator });
  notify(target, text);
  toast.success(t().plan.sent(orchestrator.payload.name));
  return true;
}

/** The board holding a card among those handed to the orchestrator. */
function boardWithCard(orchestratorId: string, cardId: string): string | null {
  return linkedBoards(orchestratorId).find(({ board }) => board.cards[cardId])?.nodeId ?? null;
}

/** The mission starts: each sub-task's card goes « En cours », its agent as a chip. `members[i]` does `plan[i]`. */
export async function startMissionCards(orchestratorId: string, members: readonly Member[], plan: readonly SubTask[]) {
  for (const [i, task] of plan.entries()) {
    const member = members[i];
    if (!task.card || !member) continue;
    const boardId = boardWithCard(orchestratorId, task.card);
    const board = boardId ? boardOf(boardId) : null;
    const started = board ? startCard(board, task.card, member.name, t().inProgress) : null;
    if (!boardId || !started) continue;
    nodesStore.getState().update(boardId, { columns: started.board.columns, cards: started.board.cards });
    await moveCardWithGithub(boardId, task.card, started.columnId);
  }
}

/** The card of a sub-task, by its title, and the board holding it. */
function taskCard(orchestratorId: string, plan: readonly SubTask[] | undefined, task: string): { boardId: string; board: KanbanPayload; card: string } | null {
  const card = plan?.find((s) => s.title === task)?.card;
  const boardId = card ? boardWithCard(orchestratorId, card) : null;
  const board = boardId ? boardOf(boardId) : null;
  return card && boardId && board ? { boardId, board, card } : null;
}

function saveCards(boardId: string, before: KanbanPayload, after: KanbanPayload) {
  if (after !== before) nodesStore.getState().update(boardId, { cards: after.cards });
}

/** A member reported done: its sub-task's card goes to the done column, its alert cleared, and its issue follows on GitHub. */
export async function finishMissionCard(orchestratorId: string, plan: readonly SubTask[] | undefined, task: string) {
  const found = taskCard(orchestratorId, plan, task);
  if (!found) return;
  const agent = found.board.cards[found.card].agent;
  if (agent) saveCards(found.boardId, found.board, setCardAgent(found.board, found.card, agent));
  const target = doneTarget(boardOf(found.boardId) ?? found.board, found.card);
  if (target) await moveCardWithGithub(found.boardId, found.card, target);
}

/** A member reported blocked or failed: its card stays « En cours », its chip on alert. */
export function flagMissionCard(orchestratorId: string, plan: readonly SubTask[] | undefined, task: string, status: KanbanAgentStatus) {
  const found = taskCard(orchestratorId, plan, task);
  if (found) saveCards(found.boardId, found.board, flagCard(found.board, found.card, status));
}

/** `reassign`: the card's chip names the agent it went to. */
export function reassignMissionCard(orchestratorId: string, plan: readonly SubTask[] | undefined, task: string, agent: string) {
  const found = taskCard(orchestratorId, plan, task);
  if (found) saveCards(found.boardId, found.board, setCardAgent(found.board, found.card, agent));
}
