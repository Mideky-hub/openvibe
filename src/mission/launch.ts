import { showNode } from "@/canvas/arrive";
import { canvasStore } from "@/canvas/canvasStore";
import { pauseAgents } from "@/fleet/broadcast";
import { GROUP_GAP, groupGrid } from "@/fleet/groupLayout";
import { closeGroup, launchGroup } from "@/fleet/groups";
import { defaultLaunchOptions } from "@/fleet/launchAgent";
import { nextName } from "@/fleet/names";
import { namesInWorkspace, pantheonForNewGroup } from "@/fleet/naming";
import { linkOrchestrator } from "@/fleet/orchestrators";
import { addTerminal } from "@/fleet/terminals";
import { messages } from "@/i18n";
import { missionAddAgent, missionCleanup, missionDiscard, missionMerge, missionPrepare, type Cleanup, type Worktree } from "@/ipc/mission";
import { ptySendText, ptyWrite } from "@/ipc/pty";
import { newConversation, newTerminalPayload } from "@/nodes/terminal/launch";
import { freshText, quietFor, relaunchTerminal, stopTerminal } from "@/nodes/terminal/registry";
import { reassignMissionCard, startMissionCards } from "@/kanban/orchestrate";
import { agentMessages } from "@/mcp/messages";
import { outReport } from "@/mcp/protocol";
import { nodesStore, sessionOf, terminalOf } from "@/store/nodes";
import { isRunning } from "@/store/terminalStatus";
import { notify } from "./events";
import { NEW_AGENT, NEW_MISSION, oneLine, sameName, type Member, type Mission, type SubTask } from "./mission";
import { whenReady } from "./ready";
import { modelFor } from "./router";
import { linkedClaudeAgents, missionOf, orchestratorShown, setMission, updateMember } from "./store";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const t = () => messages(agentMessages);

/** What an agent of the mission reads first (spec orchestrateur §7.3, §7.4). */
export function subTaskText(mission: string, task: SubTask, branch: string, handover?: string): string {
  const brief = oneLine(task.brief);
  const text = t().lines.subTask(mission, task.title, `${brief}${/[.!?]$/.test(brief) ? "" : "."}`, task.budgetMin, branch);
  return handover ? `${text} ${handover}` : text;
}

/** What the next agent learns of the previous one (spec §7.2 reassign). */
export function handoverText(from: Member): string {
  const l = t().lines;
  const report = from.report ? l.handoverReport(outReport(from.report.status), oneLine(from.report.summary)) : l.handoverNoReport;
  return l.handover(from.name, report, from.branch);
}

/**
 * A linked agent moves to `cwd` in a new conversation: a Claude session does
 * not resume from another folder (spec §7.3). It takes `model`, the router's,
 * or none to go back to Claude's own (spec maj §3).
 */
function restartIn(nodeId: string, cwd: string, model?: string): Promise<void> {
  const payload = terminalOf(nodesStore.getState().nodes[nodeId]);
  if (!payload) return Promise.resolve();
  const patch = { cwd, model, ...newConversation() };
  nodesStore.getState().update(nodeId, patch);
  return relaunchTerminal(nodeId, { ...payload, ...patch }, "new");
}

/** Right of the orchestrator, tops aligned; `launchGroup` moves it down past what it would cover. */
function besideOrchestrator(orchestratorId: string, count: number) {
  const element = canvasStore.getState().api?.getSceneElements().find((e) => e.id === orchestratorId);
  if (!element) return undefined;
  const grid = groupGrid(count);
  return { x: element.x + element.width + GROUP_GAP + grid.width / 2, y: element.y + grid.height / 2 };
}

function newNames(workspaceId: string, pantheon: string, count: number): string[] {
  const names: string[] = [];
  const taken = namesInWorkspace(workspaceId);
  for (let i = 0; i < count; i++) names.push(nextName(pantheon, [...taken, ...names]));
  return names;
}

type Team = Required<Pick<Mission, "project" | "slug" | "branch" | "worktree">> & Pick<Mission, "frameId" | "members">;

/** The relaunch of each linked agent: it is judged ready only once it is done. */
type Restarts = Map<string, Promise<void>>;

/** OpenVibe — not the AI — forms the team: every worktree first, then the agents (spec §7.3). */
async function formTeam(orchestratorId: string, workspaceId: string, project: string, mission: Mission, restarts: Restarts): Promise<Team> {
  const plan = mission.plan ?? [];
  const linked = linkedClaudeAgents(orchestratorId);
  const agents = plan.map((task) => (task.agent === NEW_AGENT ? null : (linked.find((a) => sameName(a.name, task.agent)) ?? null)));
  const lost = plan.find((task, i) => task.agent !== NEW_AGENT && !agents[i]);
  if (lost) throw new Error(t().launch.unlinked(lost.agent));
  const pantheon = pantheonForNewGroup(workspaceId);
  const fresh = newNames(workspaceId, pantheon, agents.filter((a) => a === null).length);
  const made: Worktree[] = [];
  try {
    const root = await missionPrepare(project, mission.name ?? "mission");
    made.push(root);
    const members: Member[] = [];
    let next = 0;
    for (const [i, task] of plan.entries()) {
      const agent = agents[i];
      const name = agent?.name ?? fresh[next++];
      const tree = await missionAddAgent(project, root.slug, name);
      made.push(tree);
      const model = modelFor(mission, task);
      members.push({
        nodeId: agent?.nodeId ?? "",
        name,
        task: task.title,
        budgetMin: task.budgetMin,
        linked: agent !== null,
        branch: tree.branch,
        worktree: tree.path,
        ...(model ? { model } : {}),
      });
    }
    // Its canvas is the one on screen only: the user may have left it during the git work (final review H2).
    if (!orchestratorShown(orchestratorId)) throw new Error(t().launch.leftWorkspace);
    const created = members.filter((m) => !m.linked);
    let frameId: string | undefined;
    if (created.length > 0) {
      const group = await launchGroup(
        { name: `Mission ${mission.name}`, role: "general", agents: created.map(() => "claude" as const) },
        defaultLaunchOptions(),
        besideOrchestrator(orchestratorId, created.length),
        { pantheon, names: created.map((m) => m.name), cwds: created.map((m) => m.worktree), models: created.map((m) => m.model) },
      );
      if (!group) throw new Error(t().launch.groupFailed);
      created.forEach((member, i) => (member.nodeId = group.nodeIds[i]));
      frameId = group.frameId;
      linkOrchestrator(orchestratorId, group.frameId);
    }
    // Linked agents move only once the whole team exists (final review H2).
    for (const member of members) if (member.linked) restarts.set(member.nodeId, restartIn(member.nodeId, member.worktree, member.model));
    return { project, slug: root.slug, branch: root.branch, worktree: root.path, frameId, members };
  } catch (error) {
    // What this launch made goes, so the plan can be launched again; never forced (final review H2).
    if (made.length > 0) await missionDiscard(project, made).catch(() => undefined);
    throw error;
  }
}

/** Types its sub-task in a member's terminal once it is ready (spec §7.3). */
async function assign(
  orchestratorId: string,
  member: Member,
  mission: string,
  task: SubTask,
  restarted: Promise<void> = Promise.resolve(),
  handover?: string,
) {
  const id = member.nodeId;
  // Before its relaunch ends, its screen and silence are the previous session's (final review H2).
  await restarted.catch(() => undefined);
  const ready = await whenReady({ running: () => isRunning(id), quietMs: () => quietFor(id), screen: () => freshText(id, 50), press: (keys) => ptyWrite(id, keys) });
  if (missionOf(nodesStore.getState().nodes[orchestratorId])?.state !== "en_cours") return;
  if (!isRunning(id)) {
    notify(orchestratorId, t().lines.notStarted(member.name));
    return;
  }
  // Its shell outlives a Claude that quit: the sub-task would be typed as a command (README mission).
  if (!ready) {
    notify(orchestratorId, t().lines.notReady(member.name));
    return;
  }
  await ptySendText(id, subTaskText(mission, task, member.branch, handover));
  updateMember(orchestratorId, id, { sentAt: Date.now() });
}

/** « Lancer la mission » (spec §7.3): the plan's go-ahead. A second click while it launches does nothing. */
export async function launchMission(orchestratorId: string): Promise<void> {
  const record = nodesStore.getState().nodes[orchestratorId];
  const mission = missionOf(record);
  const session = sessionOf(record);
  if (!record || !mission || !session || mission.state !== "plan" || !mission.plan?.length) return;
  // The router was turned on after the plan: without levels, every agent would get Claude's default model (final review maj §3).
  if (mission.router && mission.plan.some((task) => !task.level)) {
    const error = t().lines.levelsMissing;
    setMission(orchestratorId, { error });
    notify(orchestratorId, t().lines.proposeLevels(error));
    return;
  }
  setMission(orchestratorId, { state: "lancement", error: undefined });
  const restarts: Restarts = new Map();
  let team: Team;
  try {
    team = await formTeam(orchestratorId, record.workspaceId, session.cwd, mission, restarts);
  } catch (error) {
    setMission(orchestratorId, { state: "plan", error: errorText(error) });
    notify(orchestratorId, t().lines.couldNotStart(errorText(error)));
    return;
  }
  setMission(orchestratorId, { state: "en_cours", startedAt: Date.now(), ...team });
  const names = team.members.map((m) => `${m.name} (${m.task})`).join(", ");
  notify(orchestratorId, t().lines.goAhead(names, team.branch));
  const plan = mission.plan;
  void startMissionCards(orchestratorId, team.members, plan).catch(() => undefined);
  team.members.forEach((member, i) => void assign(orchestratorId, member, mission.name ?? "", plan[i], restarts.get(member.nodeId)));
}

/** `finish` (spec §7.7): created agents close, linked ones go back to the project. */
export function endMission(orchestratorId: string, summary: string) {
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (mission?.state !== "en_cours") return;
  // Ended first: the agents stopping now are no events.
  setMission(orchestratorId, { state: "terminee", summary, endedAt: Date.now() });
  for (const member of mission.members) if (member.linked && mission.project) void restartIn(member.nodeId, mission.project);
  if (orchestratorShown(orchestratorId)) {
    if (mission.frameId) closeGroup(mission.frameId);
    return;
  }
  // Away from its workspace its canvas cannot change: the created agents stop, freeing their worktrees (final review H2).
  for (const member of mission.members) if (!member.linked) stopTerminal(member.nodeId);
}

/** `merge` (spec §7.6): the branches of the agents done since the last merge. */
export async function mergeMission(orchestratorId: string): Promise<string> {
  const m = t().merge;
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (!mission?.worktree) return m.noBranch;
  // Merged ones too: a merge with nothing new is harmless, and new commits after a merge get in (final review H2).
  // A handed-over agent's branch goes in through its successor's (final review H3).
  const ready = mission.members.filter((m) => m.report?.status === "termine" && !m.handedTo);
  if (ready.length === 0) return m.nothing;
  const lines: string[] = [];
  for (const member of ready) {
    try {
      const { merge, uncommitted } = await missionMerge(mission.worktree, member.worktree, member.branch);
      const note = uncommitted ? m.uncommitted : "";
      if (merge.kind === "conflict") {
        lines.push(m.conflict(member.name, merge.files.join(", "), note));
        continue;
      }
      const said = merge.kind === "merged" ? m.merged : member.merged ? m.already : m.empty;
      updateMember(orchestratorId, member.nodeId, { merged: true });
      lines.push(m.line(member.name, said, note));
    } catch (error) {
      lines.push(m.failed(member.name, errorText(error)));
    }
  }
  return `${m.header(mission.branch ?? "")}\n${lines.join("\n")}`;
}

/** « Nettoyer la mission » (spec §7.7): merged worktrees go, the branches stay; the orchestrator is free again. */
export async function cleanMission(orchestratorId: string): Promise<Cleanup | string> {
  const mission = missionOf(nodesStore.getState().nodes[orchestratorId]);
  if (mission?.state !== "terminee") return t().launch.notFinished;
  const next: Mission = { ...NEW_MISSION, maxAgents: mission.maxAgents };
  if (mission.budgetMin !== undefined) next.budgetMin = mission.budgetMin;
  try {
    return mission.project && mission.slug ? await missionCleanup(mission.project, mission.slug, mission.members.map((m) => m.name)) : { removed: [], kept: [] };
  } catch (error) {
    return errorText(error);
  } finally {
    // Freed even when git fails (project moved, worktrees removed by hand): never stuck « terminée » (final review H2).
    nodesStore.getState().update(orchestratorId, { mission: next });
  }
}

/** A new agent for a handed-over sub-task: its worktree, its terminal in the mission's group, started now. */
async function newMember(orchestratorId: string, workspaceId: string, mission: Mission, task: SubTask): Promise<Member | string> {
  if (!mission.project || !mission.slug) return t().launch.noFolder;
  const frame = canvasStore.getState().frames.find((f) => f.id === mission.frameId);
  const pantheon = frame?.group?.pantheon ?? pantheonForNewGroup(workspaceId);
  const [name] = newNames(workspaceId, pantheon, 1);
  let tree: Worktree;
  try {
    tree = await missionAddAgent(mission.project, mission.slug, name);
  } catch (error) {
    return errorText(error);
  }
  const model = modelFor(mission, task);
  const payload = { ...newTerminalPayload({ ...defaultLaunchOptions(), cwd: tree.path, agent: "claude" }, name), ...(model ? { model } : {}) };
  let nodeId: string | null = null;
  if (frame) {
    nodeId = await addTerminal(workspaceId, payload, { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }, frame.id);
  } else {
    const group = await launchGroup(
      { name: `Mission ${mission.name}`, role: "general", agents: ["claude"] },
      defaultLaunchOptions(),
      besideOrchestrator(orchestratorId, 1),
      { pantheon, names: [name], cwds: [tree.path], models: [model] },
    );
    if (group) {
      nodeId = group.nodeIds[0];
      linkOrchestrator(orchestratorId, group.frameId);
      setMission(orchestratorId, { frameId: group.frameId });
    }
  }
  if (!nodeId) {
    await missionDiscard(mission.project, [tree]).catch(() => undefined);
    return t().reassign.createFailed;
  }
  // Shown, it starts like any new agent; a second start would break its session (seen in the app, H3).
  if (frame) showNode(nodeId);
  return { nodeId, name, task: task.title, budgetMin: task.budgetMin, linked: false, branch: tree.branch, worktree: tree.path, ...(model ? { model } : {}) };
}

/** `reassign` (spec §7.2): to a member who reported, or to a new agent; it gets the previous one's report and branch. */
export async function reassignTask(orchestratorId: string, fromNodeId: string, target: string): Promise<{ name: string } | string> {
  const r = t().reassign;
  const record = nodesStore.getState().nodes[orchestratorId];
  const mission = missionOf(record);
  if (!record || mission?.state !== "en_cours") return r.noMission;
  const from = mission.members.find((m) => m.nodeId === fromNodeId && !m.handedTo);
  const task = mission.plan?.find((s) => s.title === from?.task);
  if (!from || !task) return r.notFound;
  let to: Member;
  if (sameName(target, NEW_AGENT)) {
    if (!orchestratorShown(orchestratorId)) return r.hidden;
    const made = await newMember(orchestratorId, record.workspaceId, mission, task);
    if (typeof made === "string") return made;
    to = made;
  } else {
    const found = mission.members.find((m) => sameName(m.name, target) && m.nodeId !== from.nodeId && !m.handedTo);
    if (!found) return r.notOther(target);
    if (!found.report) return r.notDone(found.name);
    // Its entry takes the new sub-task: its finished work must be in the mission's branch first (final review H3).
    const finished = found.report.status === "termine";
    if (finished && !found.merged) return r.notMerged(found.name, found.task);
    to = {
      ...found,
      task: task.title,
      budgetMin: task.budgetMin,
      extraMin: undefined,
      overdue: undefined,
      report: undefined,
      sentAt: undefined,
      merged: undefined,
      done: finished ? [...(found.done ?? []), found.task] : found.done,
    };
  }
  const latest = missionOf(nodesStore.getState().nodes[orchestratorId]) ?? mission;
  const members = latest.members.map((m) => (m.nodeId === from.nodeId ? { ...m, handedTo: to.name } : m.nodeId === to.nodeId ? to : m));
  setMission(orchestratorId, { members: members.some((m) => m.nodeId === to.nodeId) ? members : [...members, to] });
  reassignMissionCard(orchestratorId, latest.plan, task.title, to.name);
  // The previous agent stops: its sub-task is another's now (final review H3).
  await pauseAgents([from.nodeId]).catch(() => 0);
  if (isRunning(from.nodeId)) {
    void ptySendText(from.nodeId, t().lines.handedAway(from.task, to.name)).catch(() => undefined);
  }
  void assign(orchestratorId, to, mission.name ?? "", task, Promise.resolve(), handoverText(from));
  return { name: to.name };
}
