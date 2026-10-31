import { messages } from "@/i18n";
import { agentMessages } from "@/mcp/messages";
import { nodesStore } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { notify } from "./events";
import { assign, mergeMember, restartIn } from "./launch";
import { oneLine, spentMin, windingDown, type Member, type Mission, type PastTask, type QueuedTask, type SubTask } from "./mission";
import { modelFor } from "./router";
import { agentState, isOrchestratorClosed, memberGroupId, missionOf, setMission } from "./store";

const t = () => messages(agentMessages);

/** `report` comes mid-turn, the last commit may follow it; past this an agent's turn does not hold the queue up. */
const TURN_END_MS = 60_000;
const TURN_POLL_MS = 1000;

/** Members being moved on, each one once: two reports must not give two tasks. */
const moving = new Set<string>();

const missionNow = (orchestratorId: string) => missionOf(nodesStore.getState().nodes[orchestratorId]);
const memberNow = (orchestratorId: string, nodeId: string) => missionNow(orchestratorId)?.members.find((m) => m.nodeId === nodeId && !m.handedTo);

/** The first task an agent may take: of its group, or of none (spec mission de nuit §4.3). */
function nextFor(mission: Mission, member: Member): QueuedTask | undefined {
  const group = memberGroupId(member);
  return mission.queue?.find((task) => !task.group || task.group.id === group);
}

/** Those who finished and could take a task now. */
export function freeMembers(mission: Mission): Member[] {
  return mission.members.filter((m) => !m.handedTo && m.report?.status === "termine" && isRunning(m.nodeId));
}

function pastTask(member: Member, report: NonNullable<Member["report"]>): PastTask {
  return {
    task: member.task,
    status: report.status,
    summary: report.summary,
    merged: member.merged === true,
    spentMin: spentMin(member, report.at),
    budgetMin: member.budgetMin,
    branch: member.branch,
  };
}

async function turnEnded(nodeId: string) {
  for (let waited = 0; waited < TURN_END_MS && agentState(nodeId) === "travaille"; waited += TURN_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, TURN_POLL_MS));
  }
}

/** The member takes `task`: out of the queue and into the plan, where `reassign` and `mission` find it. */
function take(orchestratorId: string, mission: Mission, member: Member, task: QueuedTask) {
  const report = member.report;
  if (!report) return;
  const subTask: SubTask = { ...task, agent: member.name };
  const model = modelFor(mission, subTask);
  const finished = report.status === "termine";
  const next: Member = {
    ...member,
    task: task.title,
    budgetMin: task.budgetMin,
    extraMin: undefined,
    overdue: undefined,
    report: undefined,
    sentAt: undefined,
    merged: undefined,
    model,
    done: finished ? [...(member.done ?? []), member.task] : member.done,
    past: [...(member.past ?? []), pastTask(member, report)],
  };
  const queue = (mission.queue ?? []).filter((waiting) => waiting !== task);
  setMission(orchestratorId, {
    queue,
    plan: [...(mission.plan ?? []), subTask],
    members: mission.members.map((m) => (m.nodeId === member.nodeId ? next : m)),
  });
  const brief = oneLine(task.brief);
  const text = t().lines.nextSubTask(mission.name ?? "", task.title, `${brief}${/[.!?]$/.test(brief) ? "" : "."}`, task.budgetMin, member.branch, mission.branch ?? "");
  // A new conversation: one task's context must not spill into the next, and its steps start over.
  void assign(orchestratorId, next, text, restartIn(member.nodeId, member.worktree, model));
  return t().lines.taken(member.name, task.title, queue.length);
}

/**
 * Moves a member that reported on to the queue's next task: its work merged
 * first when it is done, as for `reassign` (final review H3). What to say, if
 * anything; the mission is read again after each wait, it may have moved on.
 */
async function moveOn(orchestratorId: string, nodeId: string, mergeFirst: boolean): Promise<string | undefined> {
  const before = missionNow(orchestratorId);
  const member = memberNow(orchestratorId, nodeId);
  if (!before || !member?.report || before.state !== "en_cours" || windingDown(before, Date.now()) || !isRunning(nodeId)) return undefined;
  if (!nextFor(before, member)) return undefined;
  await turnEnded(nodeId);
  if (mergeFirst && before.worktree) {
    const { line, merged, uncommitted } = await mergeMember(orchestratorId, before.worktree, member);
    if (!merged || uncommitted) notify(orchestratorId, line);
    if (!merged) return undefined;
  }
  const mission = missionNow(orchestratorId);
  const latest = memberNow(orchestratorId, nodeId);
  const task = mission && latest && nextFor(mission, latest);
  if (!mission || !latest?.report || !task || mission.state !== "en_cours") return undefined;
  return take(orchestratorId, mission, latest, task);
}

async function moveOnce(orchestratorId: string, nodeId: string, mergeFirst: boolean): Promise<string | undefined> {
  if (moving.has(nodeId)) return undefined;
  moving.add(nodeId);
  try {
    return await moveOn(orchestratorId, nodeId, mergeFirst);
  } finally {
    moving.delete(nodeId);
  }
}

/** Every free member takes a task, if one waits for it: after a task arrives or a conflict is resolved. */
export async function pumpQueue(orchestratorId: string): Promise<void> {
  const mission = missionNow(orchestratorId);
  if (!mission?.queue?.length) return;
  await Promise.all(
    freeMembers(mission).map(async (member) => {
      const said = await moveOnce(orchestratorId, member.nodeId, true);
      if (said) notify(orchestratorId, said);
    }),
  );
}

/** Nobody is left working: the orchestrator hears why nothing moves any more. */
function tellIfIdle(orchestratorId: string) {
  const mission = missionNow(orchestratorId);
  if (!mission?.queue || mission.members.some((m) => !m.handedTo && !m.report)) return;
  const waiting = mission.queue.length;
  notify(orchestratorId, waiting === 0 ? t().lines.queueEmpty : t().lines.queueStuck(waiting));
}

/** An agent reported: « done » moves it on, the rest is the orchestrator's to decide (spec mission de nuit §4.3). */
export async function afterReport(orchestratorId: string, nodeId: string): Promise<void> {
  if (isOrchestratorClosed(orchestratorId)) return;
  if (memberNow(orchestratorId, nodeId)?.report?.status === "termine") {
    const said = await moveOnce(orchestratorId, nodeId, true);
    if (said) notify(orchestratorId, said);
  }
  tellIfIdle(orchestratorId);
}

/** `next_task`: an agent that reported takes the next task, what it did not finish staying on its branch. */
export async function giveNext(orchestratorId: string, member: Member): Promise<{ given: string } | { refused: string }> {
  if (!member.report) return { refused: t().reassign.notDone(member.name) };
  const given = await moveOnce(orchestratorId, member.nodeId, member.report.status === "termine");
  return given ? { given } : { refused: t().lines.nothingFor(member.name) };
}
