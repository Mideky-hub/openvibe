import { messages } from "@/i18n";
import { agentMessages } from "@/mcp/messages";
import { nodesStore } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { notify } from "./events";
import { assign, mergeMember, restartIn } from "./launch";
import { noNewWork, oneLine, pastTask, type Member, type Mission, type QueuedTask, type SubTask } from "./mission";
import { modelFor } from "./router";
import { agentState, isOrchestratorClosed, memberGroupId, missionOf, setMission } from "./store";

const t = () => messages(agentMessages);

/** `report` comes mid-turn, the last commit may follow it; past this an agent's turn does not hold the queue up. */
const TURN_END_MS = 60_000;
const TURN_POLL_MS = 1000;

/** Members being moved on, each one once: two reports must not give two tasks. */
const moving = new Set<string>();
/** What the orchestrator last heard of its idle team, by mission: told once. */
const idleTold = new Map<string, string>();

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

async function turnEnded(nodeId: string) {
  for (let waited = 0; waited < TURN_END_MS && agentState(nodeId) === "travaille"; waited += TURN_POLL_MS) {
    await new Promise((resolve) => setTimeout(resolve, TURN_POLL_MS));
  }
}

/** The member takes `task`: out of the queue and into the plan, where `reassign` and `mission` find it. */
function take(orchestratorId: string, mission: Mission, member: Member, report: NonNullable<Member["report"]>, task: QueuedTask): string {
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

/** The mission and member as they stand, if the member can still move on from this report. */
function stillMovable(orchestratorId: string, nodeId: string, report: NonNullable<Member["report"]>) {
  const mission = missionNow(orchestratorId);
  const member = memberNow(orchestratorId, nodeId);
  if (!mission || !member || mission.state !== "en_cours" || noNewWork(mission, Date.now()) || !isRunning(nodeId)) return null;
  if (member.report?.at !== report.at || member.report.status !== report.status) return null;
  const task = nextFor(mission, member);
  return task ? { mission, member, task } : null;
}

/**
 * Moves a member that reported on to the queue's next task: its work merged
 * first when it is done, as for `reassign` (final review H3). What to say, if
 * anything. Each wait may change everything: all is read again after it.
 */
async function moveOn(orchestratorId: string, nodeId: string): Promise<string | undefined> {
  const report = memberNow(orchestratorId, nodeId)?.report;
  if (!report || !stillMovable(orchestratorId, nodeId, report)) return undefined;
  await turnEnded(nodeId);
  const ready = stillMovable(orchestratorId, nodeId, report);
  if (!ready) return undefined;
  if (report.status === "termine" && ready.mission.worktree) {
    const { line, merged, uncommitted } = await mergeMember(orchestratorId, ready.mission.worktree, ready.member);
    if (!merged || uncommitted) notify(orchestratorId, line);
    if (!merged) return undefined;
  }
  const merged = stillMovable(orchestratorId, nodeId, report);
  return merged ? take(orchestratorId, merged.mission, merged.member, report, merged.task) : undefined;
}

async function moveOnce(orchestratorId: string, nodeId: string): Promise<string | undefined> {
  if (moving.has(nodeId)) return undefined;
  moving.add(nodeId);
  try {
    return await moveOn(orchestratorId, nodeId);
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
      const said = await moveOnce(orchestratorId, member.nodeId);
      if (said) notify(orchestratorId, said);
    }),
  );
}

/** Nobody is left working: the orchestrator hears once why nothing moves any more. */
function tellIfIdle(orchestratorId: string) {
  const mission = missionNow(orchestratorId);
  if (mission?.state !== "en_cours" || !mission.queue) return;
  const team = mission.members.filter((m) => !m.handedTo);
  if (team.some((m) => !m.report || moving.has(m.nodeId))) return;
  const line = mission.queue.length === 0 ? t().lines.queueEmpty : t().lines.queueStuck(mission.queue.length);
  const key = `${orchestratorId}:${mission.startedAt}`;
  if (idleTold.get(key) === line) return;
  idleTold.set(key, line);
  notify(orchestratorId, line);
}

/** An agent reported: « done » moves it on, the rest is the orchestrator's to decide (spec mission de nuit §4.3). */
export async function afterReport(orchestratorId: string, nodeId: string): Promise<void> {
  if (isOrchestratorClosed(orchestratorId)) return;
  if (memberNow(orchestratorId, nodeId)?.report?.status === "termine") {
    const said = await moveOnce(orchestratorId, nodeId);
    if (said) notify(orchestratorId, said);
  }
  tellIfIdle(orchestratorId);
}

/** `next_task`: an agent that reported takes the next task, what it did not finish staying on its branch and its task abandoned. */
export async function giveNext(orchestratorId: string, member: Member): Promise<{ given: string } | { refused: string }> {
  if (!member.report) return { refused: t().reassign.notDone(member.name) };
  const mission = missionNow(orchestratorId);
  if (!isRunning(member.nodeId)) return { refused: t().orchestrator.stopped(member.name) };
  if (mission && noNewWork(mission, Date.now())) return { refused: t().lines.windingDown };
  if (!mission || !nextFor(mission, member)) return { refused: t().lines.nothingFor(member.name) };
  const given = await moveOnce(orchestratorId, member.nodeId);
  return given ? { given } : { refused: t().lines.notMoved(member.name) };
}
