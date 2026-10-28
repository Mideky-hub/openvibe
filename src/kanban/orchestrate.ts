import { toast } from "sonner";
import { canvasStore } from "@/canvas/canvasStore";
import { addOrchestrator } from "@/fleet/orchestrators";
import { messages } from "@/i18n";
import { notify } from "@/mission/events";
import type { Member, SubTask } from "@/mission/mission";
import type { KanbanPayload } from "@/nodes/types";
import { nodesStore } from "@/store/nodes";
import { moveCardWithGithub } from "./github";
import { kanbanMessages } from "./messages";
import { doneTarget, linkedTo, linkOrchestrator, planRequest, startCard } from "./missionLink";

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

/** A member reported done: its sub-task's card goes to the done column, and its issue follows on GitHub. */
export async function finishMissionCard(orchestratorId: string, plan: readonly SubTask[] | undefined, task: string) {
  const card = plan?.find((s) => s.title === task)?.card;
  const boardId = card ? boardWithCard(orchestratorId, card) : null;
  const board = boardId ? boardOf(boardId) : null;
  const target = board && card ? doneTarget(board, card) : null;
  if (boardId && card && target) await moveCardWithGithub(boardId, card, target);
}
